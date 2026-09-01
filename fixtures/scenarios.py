"""
Scripted incident scenarios for the demo, per the brief's build sequence
step 5: "Write a few incident scenarios (a DB issue, a deployment rollback,
a network partition) as fixtures. Run them through the full pipeline and
confirm the dashboard tells a coherent story for each."
"""
from agents.models import IncidentSignal

SCENARIOS: dict[str, IncidentSignal] = {
    "payment-outage": IncidentSignal(
        title="Payment service returning 503s at checkout",
        service="payments-api",
        error_rate_pct=42.0,
        latency_p99_ms=1200,
        affected_users=40000,
        revenue_per_min_usd=300_000,
        raw_context=(
            "2:47 AM. payments-api throwing 503 on ~40% of requests. No recent deploy in the last 6 hours. "
            "Load balancer healthy. DB connection count near max pool size."
        ),
    ),
    "bad-deploy": IncidentSignal(
        title="Search results empty after v2.14 rollout",
        service="search-svc",
        error_rate_pct=9.5,
        latency_p99_ms=650,
        affected_users=8500,
        revenue_per_min_usd=12_000,
        raw_context=(
            "v2.14 deployed 11 minutes ago to search-svc. Error rate climbed immediately after rollout completed. "
            "Deploy included a schema migration on the index-mapping table."
        ),
    ),
    "network-partition": IncidentSignal(
        title="Cross-region latency spike, intermittent timeouts",
        service="orders-svc",
        error_rate_pct=6.0,
        latency_p99_ms=4200,
        affected_users=15000,
        revenue_per_min_usd=45_000,
        raw_context=(
            "orders-svc in us-east cluster showing intermittent timeouts calling inventory-svc in us-west. "
            "No deploy in the last 24 hours. Cross-region link showing packet loss on monitoring dashboard."
        ),
    ),
}
