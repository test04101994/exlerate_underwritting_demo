#!/usr/bin/env python3
"""Seed property policy and claims knowledge bases into S3 + S3 Vectors."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "agentcore"))

import settings
from tools.doc_analysis import get_embedding, ensure_vector_store

S3_BUCKET = settings.S3_BUCKET
KB_PREFIX = "knowledge-bases"
POLICY_INDEX = "property-policy-kb"
CLAIMS_INDEX = "property-claims-kb"


def generate_policies():
    return [
        {"policy_number": "PPL-2024-00101", "insured_name": "Metro Office Holdings LLC", "address": "500 Main St, Dallas, TX 75201", "property_type": "Commercial", "construction_type": "Fire Resistive", "year_built": 2010, "tiv": 5200000, "premium": 18200, "coverage_limit": 5000000, "deductible": 25000, "loss_ratio": 0.42, "claims_count": 1, "occupancy_type": "Office", "region": "South", "broker": "Marsh McLennan"},
        {"policy_number": "PPL-2024-00102", "insured_name": "Greenfield Retail Partners", "address": "1800 Peachtree Rd NW, Atlanta, GA 30309", "property_type": "Commercial", "construction_type": "Masonry", "year_built": 1998, "tiv": 3800000, "premium": 15200, "coverage_limit": 3500000, "deductible": 15000, "loss_ratio": 0.55, "claims_count": 2, "occupancy_type": "Retail", "region": "South", "broker": "Aon"},
        {"policy_number": "PPL-2024-00103", "insured_name": "Northeast Warehouse Corp", "address": "42 Industrial Pkwy, Newark, NJ 07102", "property_type": "Commercial", "construction_type": "Masonry", "year_built": 1985, "tiv": 8500000, "premium": 34000, "coverage_limit": 8000000, "deductible": 50000, "loss_ratio": 0.38, "claims_count": 1, "occupancy_type": "Warehouse", "region": "Northeast", "broker": "Willis Towers Watson"},
        {"policy_number": "PPL-2024-00104", "insured_name": "Sunrise Manufacturing Inc", "address": "7700 NW 36th St, Miami, FL 33166", "property_type": "Commercial", "construction_type": "Frame", "year_built": 1992, "tiv": 12000000, "premium": 60000, "coverage_limit": 10000000, "deductible": 75000, "loss_ratio": 0.68, "claims_count": 4, "occupancy_type": "Manufacturing", "region": "South", "broker": "Marsh McLennan"},
        {"policy_number": "PPL-2024-00105", "insured_name": "Pacific Tech Campus LLC", "address": "2200 Sand Hill Rd, Menlo Park, CA 94025", "property_type": "Commercial", "construction_type": "Fire Resistive", "year_built": 2015, "tiv": 25000000, "premium": 75000, "coverage_limit": 25000000, "deductible": 100000, "loss_ratio": 0.22, "claims_count": 0, "occupancy_type": "Office", "region": "West", "broker": "Lockton"},
        {"policy_number": "PPL-2024-00106", "insured_name": "Heartland Grain Storage", "address": "1100 County Rd 200, Springfield, IL 62704", "property_type": "Commercial", "construction_type": "Frame", "year_built": 1978, "tiv": 2200000, "premium": 11000, "coverage_limit": 2000000, "deductible": 10000, "loss_ratio": 0.51, "claims_count": 2, "occupancy_type": "Warehouse", "region": "Midwest", "broker": "Gallagher"},
        {"policy_number": "PPL-2024-00107", "insured_name": "Bayou Restaurant Group", "address": "800 Magazine St, New Orleans, LA 70130", "property_type": "Commercial", "construction_type": "Masonry", "year_built": 1965, "tiv": 1800000, "premium": 12600, "coverage_limit": 1500000, "deductible": 10000, "loss_ratio": 0.72, "claims_count": 3, "occupancy_type": "Restaurant", "region": "South", "broker": "Brown & Brown"},
        {"policy_number": "PPL-2024-00108", "insured_name": "Empire State Offices Inc", "address": "350 5th Ave, New York, NY 10118", "property_type": "Commercial", "construction_type": "Fire Resistive", "year_built": 2000, "tiv": 18000000, "premium": 54000, "coverage_limit": 18000000, "deductible": 75000, "loss_ratio": 0.31, "claims_count": 1, "occupancy_type": "Office", "region": "Northeast", "broker": "Marsh McLennan"},
        {"policy_number": "PPL-2024-00109", "insured_name": "Lakefront Condos HOA", "address": "1500 N Lake Shore Dr, Chicago, IL 60610", "property_type": "Residential", "construction_type": "Masonry", "year_built": 2008, "tiv": 6500000, "premium": 19500, "coverage_limit": 6000000, "deductible": 25000, "loss_ratio": 0.35, "claims_count": 1, "occupancy_type": "Residential", "region": "Midwest", "broker": "Aon"},
        {"policy_number": "PPL-2024-00110", "insured_name": "Gulf Coast Logistics", "address": "4500 Port Blvd, Houston, TX 77029", "property_type": "Commercial", "construction_type": "Frame", "year_built": 1995, "tiv": 7200000, "premium": 36000, "coverage_limit": 7000000, "deductible": 35000, "loss_ratio": 0.61, "claims_count": 3, "occupancy_type": "Warehouse", "region": "South", "broker": "Willis Towers Watson"},
        {"policy_number": "PPL-2024-00111", "insured_name": "Rocky Mountain Retail", "address": "1600 California St, Denver, CO 80202", "property_type": "Commercial", "construction_type": "Masonry", "year_built": 2012, "tiv": 4100000, "premium": 14350, "coverage_limit": 4000000, "deductible": 20000, "loss_ratio": 0.28, "claims_count": 0, "occupancy_type": "Retail", "region": "West", "broker": "Lockton"},
        {"policy_number": "PPL-2024-00112", "insured_name": "Carolina Office Park", "address": "300 S Tryon St, Charlotte, NC 28202", "property_type": "Commercial", "construction_type": "Fire Resistive", "year_built": 2018, "tiv": 9800000, "premium": 29400, "coverage_limit": 9500000, "deductible": 50000, "loss_ratio": 0.19, "claims_count": 0, "occupancy_type": "Office", "region": "South", "broker": "Gallagher"},
        {"policy_number": "PPL-2024-00113", "insured_name": "Boston Harbor Hotel Group", "address": "70 Rowes Wharf, Boston, MA 02110", "property_type": "Commercial", "construction_type": "Fire Resistive", "year_built": 1990, "tiv": 15000000, "premium": 52500, "coverage_limit": 15000000, "deductible": 75000, "loss_ratio": 0.44, "claims_count": 2, "occupancy_type": "Hotel", "region": "Northeast", "broker": "Aon"},
        {"policy_number": "PPL-2024-00114", "insured_name": "Midwest Auto Parts Depot", "address": "2800 W Grand Ave, Detroit, MI 48208", "property_type": "Commercial", "construction_type": "Frame", "year_built": 1972, "tiv": 3200000, "premium": 19200, "coverage_limit": 3000000, "deductible": 15000, "loss_ratio": 0.58, "claims_count": 2, "occupancy_type": "Warehouse", "region": "Midwest", "broker": "Brown & Brown"},
        {"policy_number": "PPL-2024-00115", "insured_name": "Sunset Strip Retail LLC", "address": "8500 Sunset Blvd, West Hollywood, CA 90069", "property_type": "Commercial", "construction_type": "Masonry", "year_built": 1988, "tiv": 11000000, "premium": 38500, "coverage_limit": 10000000, "deductible": 50000, "loss_ratio": 0.33, "claims_count": 1, "occupancy_type": "Retail", "region": "West", "broker": "Marsh McLennan"},
    ]


def generate_claims():
    return [
        {"claim_id": "CLM-2024-0001", "policy_number": "PPL-2024-00101", "insured_name": "Metro Office Holdings LLC", "claim_date": "2024-06-15", "loss_type": "water", "loss_amount": 85000, "reserve_amount": 95000, "status": "closed", "description": "Pipe burst on 3rd floor causing water damage to office space and IT equipment", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0002", "policy_number": "PPL-2024-00102", "insured_name": "Greenfield Retail Partners", "claim_date": "2024-03-22", "loss_type": "wind", "loss_amount": 120000, "reserve_amount": 130000, "status": "closed", "description": "Severe thunderstorm damaged roof and storefront signage", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0003", "policy_number": "PPL-2024-00102", "insured_name": "Greenfield Retail Partners", "claim_date": "2024-09-10", "loss_type": "theft", "loss_amount": 45000, "reserve_amount": 50000, "status": "closed", "description": "Break-in resulting in loss of merchandise and register damage", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0004", "policy_number": "PPL-2024-00103", "insured_name": "Northeast Warehouse Corp", "claim_date": "2024-01-18", "loss_type": "fire", "loss_amount": 210000, "reserve_amount": 250000, "status": "closed", "description": "Electrical fire in loading dock area damaging inventory and structure", "property_type": "Commercial", "region": "Northeast"},
        {"claim_id": "CLM-2024-0005", "policy_number": "PPL-2024-00104", "insured_name": "Sunrise Manufacturing Inc", "claim_date": "2024-08-25", "loss_type": "wind", "loss_amount": 350000, "reserve_amount": 400000, "status": "open", "description": "Hurricane damage to manufacturing facility roof and exterior walls", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0006", "policy_number": "PPL-2024-00104", "insured_name": "Sunrise Manufacturing Inc", "claim_date": "2023-11-05", "loss_type": "water", "loss_amount": 95000, "reserve_amount": 100000, "status": "closed", "description": "Flooding from heavy rainfall causing water damage to ground floor equipment", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0007", "policy_number": "PPL-2024-00104", "insured_name": "Sunrise Manufacturing Inc", "claim_date": "2023-03-14", "loss_type": "liability", "loss_amount": 175000, "reserve_amount": 200000, "status": "closed", "description": "Worker injury due to equipment malfunction on production line", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0008", "policy_number": "PPL-2024-00104", "insured_name": "Sunrise Manufacturing Inc", "claim_date": "2022-07-20", "loss_type": "fire", "loss_amount": 180000, "reserve_amount": 190000, "status": "closed", "description": "Chemical fire in storage area requiring hazmat cleanup", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0009", "policy_number": "PPL-2024-00106", "insured_name": "Heartland Grain Storage", "claim_date": "2024-04-02", "loss_type": "wind", "loss_amount": 65000, "reserve_amount": 70000, "status": "closed", "description": "Tornado damage to grain silo roof panels and conveyor system", "property_type": "Commercial", "region": "Midwest"},
        {"claim_id": "CLM-2024-0010", "policy_number": "PPL-2024-00106", "insured_name": "Heartland Grain Storage", "claim_date": "2023-08-15", "loss_type": "fire", "loss_amount": 48000, "reserve_amount": 55000, "status": "closed", "description": "Dust explosion in grain elevator causing structural damage", "property_type": "Commercial", "region": "Midwest"},
        {"claim_id": "CLM-2024-0011", "policy_number": "PPL-2024-00107", "insured_name": "Bayou Restaurant Group", "claim_date": "2024-07-01", "loss_type": "water", "loss_amount": 78000, "reserve_amount": 85000, "status": "open", "description": "Flash flooding damaged kitchen equipment and dining area furniture", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0012", "policy_number": "PPL-2024-00107", "insured_name": "Bayou Restaurant Group", "claim_date": "2023-12-20", "loss_type": "fire", "loss_amount": 125000, "reserve_amount": 140000, "status": "closed", "description": "Kitchen grease fire spreading to ventilation system", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0013", "policy_number": "PPL-2024-00107", "insured_name": "Bayou Restaurant Group", "claim_date": "2023-05-10", "loss_type": "liability", "loss_amount": 55000, "reserve_amount": 60000, "status": "closed", "description": "Customer slip and fall on wet floor resulting in injury claim", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0014", "policy_number": "PPL-2024-00108", "insured_name": "Empire State Offices Inc", "claim_date": "2024-02-28", "loss_type": "water", "loss_amount": 195000, "reserve_amount": 220000, "status": "closed", "description": "Sprinkler system malfunction flooding three floors of office space", "property_type": "Commercial", "region": "Northeast"},
        {"claim_id": "CLM-2024-0015", "policy_number": "PPL-2024-00109", "insured_name": "Lakefront Condos HOA", "claim_date": "2024-05-15", "loss_type": "water", "loss_amount": 42000, "reserve_amount": 50000, "status": "closed", "description": "Roof leak during spring storms causing water damage to top floor units", "property_type": "Residential", "region": "Midwest"},
        {"claim_id": "CLM-2024-0016", "policy_number": "PPL-2024-00110", "insured_name": "Gulf Coast Logistics", "claim_date": "2024-09-05", "loss_type": "wind", "loss_amount": 280000, "reserve_amount": 320000, "status": "open", "description": "Tropical storm tore off warehouse roof sections and damaged stored goods", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0017", "policy_number": "PPL-2024-00110", "insured_name": "Gulf Coast Logistics", "claim_date": "2023-06-18", "loss_type": "water", "loss_amount": 55000, "reserve_amount": 60000, "status": "closed", "description": "Storm surge flooded loading bays and damaged inventory", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0018", "policy_number": "PPL-2024-00110", "insured_name": "Gulf Coast Logistics", "claim_date": "2022-10-12", "loss_type": "theft", "loss_amount": 92000, "reserve_amount": 100000, "status": "closed", "description": "Organized cargo theft from warehouse during overnight hours", "property_type": "Commercial", "region": "South"},
        {"claim_id": "CLM-2024-0019", "policy_number": "PPL-2024-00113", "insured_name": "Boston Harbor Hotel Group", "claim_date": "2024-01-25", "loss_type": "water", "loss_amount": 165000, "reserve_amount": 180000, "status": "closed", "description": "Frozen pipe burst during winter storm causing extensive water damage to guest rooms", "property_type": "Commercial", "region": "Northeast"},
        {"claim_id": "CLM-2024-0020", "policy_number": "PPL-2024-00114", "insured_name": "Midwest Auto Parts Depot", "claim_date": "2024-06-30", "loss_type": "fire", "loss_amount": 145000, "reserve_amount": 160000, "status": "denied", "description": "Suspected arson in auto parts storage area, investigation ongoing", "property_type": "Commercial", "region": "Midwest"},
    ]


def record_to_text(record, record_type):
    """Convert a record to searchable text for embedding."""
    if record_type == "policy":
        return (
            f"Policy {record['policy_number']} for {record['insured_name']}, "
            f"{record['property_type']} {record['occupancy_type']} property at {record['address']}, "
            f"{record['construction_type']} construction built {record['year_built']}, "
            f"TIV ${record['tiv']:,.0f}, premium ${record['premium']:,.0f}, "
            f"coverage limit ${record['coverage_limit']:,.0f}, deductible ${record['deductible']:,.0f}, "
            f"loss ratio {record['loss_ratio']:.0%}, {record['claims_count']} claims, "
            f"region {record['region']}, broker {record['broker']}"
        )
    else:
        return (
            f"Claim {record['claim_id']} on policy {record['policy_number']} "
            f"for {record['insured_name']}, {record['loss_type']} loss of ${record['loss_amount']:,.0f} "
            f"on {record['claim_date']}, status {record['status']}, "
            f"{record['property_type']} property in {record['region']} region. "
            f"{record['description']}"
        )


def upload_and_ingest():
    policies = generate_policies()
    claims = generate_claims()

    # Upload JSON files to S3
    for name, data in [("property-policies.json", policies), ("property-claims.json", claims)]:
        key = f"{KB_PREFIX}/{name}"
        settings.s3_client.put_object(
            Bucket=S3_BUCKET, Key=key,
            Body=json.dumps(data, indent=2), ContentType="application/json",
        )
        print(f"Uploaded s3://{S3_BUCKET}/{key} ({len(data)} records)")

    # Create vector indexes
    ensure_vector_store(POLICY_INDEX)
    ensure_vector_store(CLAIMS_INDEX)

    # Ingest policies
    print(f"\nIngesting {len(policies)} policies into {POLICY_INDEX}...")
    vectors = []
    for p in policies:
        text = record_to_text(p, "policy")
        embedding = get_embedding(text)
        vectors.append({
            "key": p["policy_number"],
            "data": {"float32": embedding},
            "metadata": {
                "source_text": text,
                "policy_number": p["policy_number"],
                "insured_name": p["insured_name"],
                "property_type": p["property_type"],
                "construction_type": p["construction_type"],
                "occupancy_type": p["occupancy_type"],
                "region": p["region"],
                "tiv": str(p["tiv"]),
                "premium": str(p["premium"]),
                "coverage_limit": str(p["coverage_limit"]),
                "deductible": str(p["deductible"]),
                "loss_ratio": str(p["loss_ratio"]),
                "claims_count": str(p["claims_count"]),
                "year_built": str(p["year_built"]),
            },
        })
    settings.s3vectors_client.put_vectors(
        vectorBucketName=settings.VECTOR_BUCKET_NAME,
        indexName=POLICY_INDEX, vectors=vectors,
    )
    print(f"Ingested {len(vectors)} policy vectors")

    # Ingest claims
    print(f"\nIngesting {len(claims)} claims into {CLAIMS_INDEX}...")
    vectors = []
    for c in claims:
        text = record_to_text(c, "claim")
        embedding = get_embedding(text)
        vectors.append({
            "key": c["claim_id"],
            "data": {"float32": embedding},
            "metadata": {
                "source_text": text,
                "claim_id": c["claim_id"],
                "policy_number": c["policy_number"],
                "insured_name": c["insured_name"],
                "loss_type": c["loss_type"],
                "loss_amount": str(c["loss_amount"]),
                "status": c["status"],
                "property_type": c["property_type"],
                "region": c["region"],
            },
        })
    settings.s3vectors_client.put_vectors(
        vectorBucketName=settings.VECTOR_BUCKET_NAME,
        indexName=CLAIMS_INDEX, vectors=vectors,
    )
    print(f"Ingested {len(vectors)} claims vectors")
    print("\nDone! Knowledge bases seeded.")


if __name__ == "__main__":
    upload_and_ingest()
