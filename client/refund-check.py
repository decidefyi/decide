#!/usr/bin/env python3
"""
Refund Eligibility Notary - Python Client

One-liner check for subscription refund eligibility.
Returns: ALLOWED, DENIED, or UNKNOWN

USAGE:
    python refund-check.py <vendor> <days_since_purchase> [conditions_met]

EXAMPLES:
    python refund-check.py adobe 12 true     # Verified conditions + window -> ALLOWED
    python refund-check.py spotify 1         # Categorical no-refund policy -> DENIED
    python refund-check.py apple_music 5     # Approval-dependent policy -> UNKNOWN

SUPPORTED VENDORS (100):
    See https://refund.decide.fyi or README.md for the full list.
    Includes: adobe, amazon_prime, apple_app_store, expressvpn,
    google_play, microsoft_365, netflix, spotify, and many more.

REQUIREMENTS:
    Python 3.6+ with requests library
    Install: pip install requests
"""

import sys
import requests

def check_refund_eligibility(vendor, days_since_purchase, qualifying_conditions_met=None):
    """Check if a subscription purchase is eligible for refund."""
    response = requests.post(
        "https://refund.decide.fyi/api/v1/refund/eligibility",
        json={
            "vendor": vendor,
            "days_since_purchase": days_since_purchase,
            "region": "US",
            "plan": "individual",
            **({} if qualifying_conditions_met is None else {
                "qualifying_conditions_met": qualifying_conditions_met
            })
        }
    )
    return response.json()

if __name__ == "__main__":
    if len(sys.argv) not in (3, 4):
        print("Usage: python refund-check.py <vendor> <days_since_purchase> [conditions_met]")
        print("Example: python refund-check.py adobe 12 true")
        sys.exit(1)

    vendor = sys.argv[1]
    try:
        days = int(sys.argv[2])
    except ValueError:
        print("Error: days_since_purchase must be a number")
        sys.exit(1)

    qualifying_conditions_met = None
    if len(sys.argv) == 4:
        if sys.argv[3] not in ("true", "false"):
            print("Error: conditions_met must be true or false")
            sys.exit(1)
        qualifying_conditions_met = sys.argv[3] == "true"

    result = check_refund_eligibility(vendor, days, qualifying_conditions_met)

    # Pretty print result
    icon = {
        "ALLOWED": "✅",
        "DENIED": "❌",
        "UNKNOWN": "❓"
    }.get(result["verdict"], "❓")

    print(f"\n{icon} {result['verdict']}")
    print(f"   {result['message']}")

    if "window_days" in result:
        print(f"   Window: {result['window_days']} days")
    if result.get("required_context"):
        print(f"   Required context: {', '.join(result['required_context'])}")
    print(f"   Rules version: {result['rules_version']}\n")
