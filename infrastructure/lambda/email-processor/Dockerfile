FROM public.ecr.aws/ubuntu/ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3, LibreOffice, pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    libreoffice-core \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Lambda RIC and boto3
RUN pip3 install --no-cache-dir awslambdaric boto3 pymupdf

# Create Lambda task root
ENV LAMBDA_TASK_ROOT=/var/task
RUN mkdir -p ${LAMBDA_TASK_ROOT}
WORKDIR ${LAMBDA_TASK_ROOT}

COPY handler.py ${LAMBDA_TASK_ROOT}/

ENTRYPOINT ["python3", "-m", "awslambdaric"]
CMD ["handler.handler"]
