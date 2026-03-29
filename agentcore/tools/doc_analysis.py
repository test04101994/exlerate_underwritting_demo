"""Document analysis tool: S3 Vectors RAG over uploaded PDFs (per-ticket isolation)."""

from __future__ import annotations

import json
import logging
import os
import tempfile

import context as ctx_mod
import settings
from strands import tool

logger = logging.getLogger("agentcore")


def get_embedding(text: str) -> list[float]:
    """Generate embedding using Titan Embed Text v2."""
    response = settings.bedrock_runtime.invoke_model(
        modelId=settings.EMBEDDING_MODEL_ID,
        body=json.dumps({"inputText": text}),
    )
    body = json.loads(response["body"].read())
    return body["embedding"]


def _is_uuid(val: str) -> bool:
    return len(val) == 36 and val.count("-") == 4


def _get_index_name(ticket_key: str = "", attachment_id: str = "") -> str:
    """Return vector index name — isolated per ticket/submission, and per attachment for submissions."""
    if not ticket_key or ticket_key == "general":
        return settings.VECTOR_INDEX_NAME
    # Submission UUIDs get per-attachment indexes
    if _is_uuid(ticket_key):
        if attachment_id:
            return f"sub-{ticket_key[:8]}-att-{attachment_id[:8]}"
        return f"submission-{ticket_key}"
    # Jira ticket keys (e.g. PROJ-123) — own index
    return f"ticket-{ticket_key}"


def ensure_vector_store(index_name: str = "") -> None:
    """Create S3 Vectors bucket and index if they don't exist."""
    from botocore.exceptions import ClientError

    idx = index_name or settings.VECTOR_INDEX_NAME

    try:
        settings.s3vectors_client.create_vector_bucket(vectorBucketName=settings.VECTOR_BUCKET_NAME)
        logger.info(f"Created vector bucket: {settings.VECTOR_BUCKET_NAME}")
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("ConflictException", "BucketAlreadyExists", "BucketAlreadyOwnedByYou"):
            raise

    try:
        settings.s3vectors_client.create_index(
            vectorBucketName=settings.VECTOR_BUCKET_NAME,
            indexName=idx,
            dataType="float32",
            dimension=1024,
            distanceMetric="cosine",
            metadataConfiguration={
                "nonFilterableMetadataKeys": ["source_text", "bboxes", "page_width", "page_height"],
            },
        )
        logger.info(f"Created vector index: {idx}")
    except ClientError as e:
        if e.response["Error"]["Code"] not in ("ConflictException", "IndexAlreadyExists"):
            raise


def ingest_pdf_from_s3(bucket: str, key: str, ticket_key: str = "general", attachment_id: str = "") -> int:
    """Download PDF from S3, chunk it, embed, and store in S3 Vectors.
    For submissions, creates a separate vector index per attachment.
    """
    import fitz  # pymupdf

    index_name = _get_index_name(ticket_key, attachment_id)
    ensure_vector_store(index_name)

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    settings.s3_client.download_file(bucket, key, tmp.name)
    tmp.close()
    logger.info(f"Downloaded s3://{bucket}/{key} to {tmp.name}")

    doc = fitz.open(tmp.name)
    chunks = []
    chunk_index = 0

    for page_num in range(len(doc)):
        page = doc[page_num]
        page_dict = page.get_text("dict")
        words = []
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if text:
                        words.extend(text.split())

        start = 0
        while start < len(words):
            end = min(start + 100, len(words))
            chunk_text = " ".join(words[start:end])
            if chunk_text.strip():
                chunks.append({
                    "chunk_index": chunk_index,
                    "page": page_num + 1,
                    "text": chunk_text,
                })
                chunk_index += 1
            if end >= len(words):
                break
            start = end - 20

    doc.close()
    os.unlink(tmp.name)
    logger.info(f"Extracted {len(chunks)} chunks from PDF")

    if not chunks:
        return 0

    batch_size = 50
    for i in range(0, len(chunks), batch_size):
        batch = chunks[i:i + batch_size]
        vectors = []
        for chunk in batch:
            embedding = get_embedding(chunk["text"])
            source_text = chunk["text"][:2000] if len(chunk["text"]) > 2000 else chunk["text"]
            vectors.append({
                "key": f"{ticket_key}/{key}-chunk-{chunk['chunk_index']}",
                "data": {"float32": embedding},
                "metadata": {
                    "source_text": source_text,
                    "page": str(chunk["page"]),
                    "s3_key": key,
                    "ticket_key": ticket_key,
                },
            })

        settings.s3vectors_client.put_vectors(
            vectorBucketName=settings.VECTOR_BUCKET_NAME,
            indexName=index_name,
            vectors=vectors,
        )
        logger.info(f"Uploaded vectors {i + 1}-{min(i + batch_size, len(chunks))} of {len(chunks)} to {index_name}")

    return len(chunks)


@tool
def doc_analysis(query: str) -> str:
    """Analyze uploaded PDF documents and answer questions about them. Use this tool when the user \
asks about a document they uploaded, wants a summary, or has questions about PDF content.

    Args:
        query: The question or analysis request about the uploaded document

    Returns:
        Answer based on the document content
    """
    try:
        ticket_key = ctx_mod.get_ticket_key()
        session_id = ctx_mod.get_session_id()
        logger.info(f"[doc_analysis] Query: {query[:60]}... | ticket_key: {ticket_key}")

        query_embedding = get_embedding(query)

        # For submissions, query all per-attachment indexes
        indexes_to_query = []
        if _is_uuid(ticket_key):
            from state import _session_context
            ctx = _session_context.get(session_id, {})
            att_indexes = ctx.get("attachment_indexes", [])
            indexes_to_query = list(att_indexes) if att_indexes else []
        if not indexes_to_query:
            indexes_to_query = [_get_index_name(ticket_key)]

        results = []
        for idx in indexes_to_query:
            try:
                resp = settings.s3vectors_client.query_vectors(
                    vectorBucketName=settings.VECTOR_BUCKET_NAME,
                    indexName=idx,
                    queryVector={"float32": query_embedding},
                    topK=settings.TOP_K,
                    returnDistance=True,
                    returnMetadata=True,
                )
                results.extend(resp.get("vectors", []))
            except Exception as e:
                logger.warning(f"[doc_analysis] Failed to query index {idx}: {e}")

        # Sort by distance (closest first) and take top K
        results.sort(key=lambda v: v.get("distance", 999))
        results = results[:settings.TOP_K]

        if not results:
            return f"No relevant context found in documents for this case{f' ({ticket_key})' if ticket_key else ''}. Please upload a PDF first."

        context_parts = []
        for i, result in enumerate(results):
            metadata = result.get("metadata", {})
            text = metadata.get("source_text", "")
            page = metadata.get("page", "?")
            distance = result.get("distance", 0)
            context_parts.append(f"[Chunk {i + 1}, Page {page}, Score: {distance:.4f}]\n{text}")

        context = "\n\n---\n\n".join(context_parts)

        system_prompt = (
            "You are a helpful assistant that answers questions based on the provided context "
            "from a PDF document. Use ONLY the context to answer. If the context doesn't contain "
            "enough information, say so. Be specific and cite page numbers when possible."
        )

        response = settings.bedrock_runtime.converse(
            modelId=settings.LLM_MODEL_ID,
            system=[{"text": system_prompt}],
            messages=[{
                "role": "user",
                "content": [{"text": f"CONTEXT:\n{context}\n\nQUESTION: {query}"}],
            }],
            inferenceConfig={"maxTokens": 1024},
        )

        answer = response["output"]["message"]["content"][0]["text"]
        return answer

    except Exception as e:
        logger.error(f"Doc analysis error: {e}")
        return f"Error analyzing document: {str(e)}"
