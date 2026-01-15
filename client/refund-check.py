#!/usr/bin/env python3
"""
Refund Eligibility Notary - Python Client

One-liner check for subscription refund eligibility.
Returns: ALLOWED, DENIED, or UNKNOWN

USAGE:
    python refund-check.py <vendor> <days_since_purchase>

EXAMPLES:
    python refund-check.py adobe 12          # Within 14-day window -> ALLOWED
    python refund-check.py spotify 1         # No refunds -> DENIED
    python refund-check.py microsoft_365 25  # Within 30-day window -> ALLOWED

SUPPORTED VENDORS:
    adobe, spotify, apple_app_store, google_play, microsoft_365,
    netflix, canva, dropbox_us, notion

REQUIREMENTS:
    Python 3.6+ with requests library
    Install: pip install requests
"""

import sys
import requests

def check_refund_eligibility(vendor, days_since_purchase):
    """Check if a subscription purchase is eligible for refund."""
    response = requests.post(
        "https://refund.decide.fyi/api/v1/refund/eligibility",
        json={
            "vendor": vendor,
            "days_since_purchase": days_since_purchase,
            "region": "US",
            "plan": "individual"
        }
    )
    return response.json()

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("❌ Usage: python refund-check.py <vendor> <days_since_purchase>")
        print("   Example: python refund-check.py adobe 12")
        sys.exit(1)

    vendor = sys.argv[1]
    try:
        days = int(sys.argv[2])
    except ValueError:
        print("❌ Error: days_since_purchase must be a number")
        sys.exit(1)

    result = check_refund_eligibility(vendor, days)

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
    print(f"   Rules version: {result['rules_version']}\n")
