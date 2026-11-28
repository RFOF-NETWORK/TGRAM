import re
import sys

IBAN_LENGTHS = {"DE": 22, "FR": 27, "AT": 20, "CH": 21, "NL": 18, "BE": 16, "IT": 27, "ES": 24, "LU": 20}


def validate_iban_iso13616(iban: str) -> bool:
    iban = iban.replace(" ", "").upper()
    if not re.fullmatch(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{10,30}", iban):
        return False
    expected = IBAN_LENGTHS.get(iban[:2])
    if expected and len(iban) != expected:
        return False
    rearranged = iban[4:] + iban[:4]
    numeric = "".join(str(ord(c) - 55) if c.isalpha() else c for c in rearranged)
    return int(numeric) % 97 == 1


def init_fints_commerzbank(account_holder: str, iban: str, bic: str) -> dict:
    if not validate_iban_iso13616(iban):
        return {"status": "error", "message": "Invalid IBAN (ISO 13616)"}
    return {
        "status": "ready_for_fints",
        "project_leader": "EU-EA-EN-EUN-PROJEKTLEITER",
        "holder": account_holder,
        "iban_masked": f"{iban[:4]}********{iban[-4:]}",
        "bic": bic,
        "fints_url": "https://fints.commerzbank.de/fints",
        "eu_zone": "EU-DE / EU-FR",
    }


if __name__ == "__main__":
    test = sys.argv[1] if len(sys.argv) > 1 else "DE89370400440532013000"
    print(f"[*] {test} valid: {validate_iban_iso13616(test)}")
