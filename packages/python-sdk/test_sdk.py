import json
import sys

from guardrail_mesh import MeshEvaluator


def main():
    evaluator = MeshEvaluator("http://localhost:3000", timeout=15)
    payload = {
        "model_version": "test-model-v1",
        "certificate_hash": "ABCD1234",
        "metrics": {
            "mesh_score": 875,
            "jailbreak_rate": 0.04,
            "fp_rate": 0.02,
            "safety_sharpe": 12.5,
        },
    }

    try:
        response = evaluator.sync_to_registry(api_key="dummy-api-key", payload=payload)
    except Exception as exc:
        print("FAIL")
        print(json.dumps({"error": str(exc)}, indent=2, sort_keys=True))
        return 1

    if response.get("success") is True:
        print("PASS")
        print(json.dumps(response, indent=2, sort_keys=True))
        return 0

    print("FAIL")
    print(json.dumps(response, indent=2, sort_keys=True))
    return 1


if __name__ == "__main__":
    sys.exit(main())
