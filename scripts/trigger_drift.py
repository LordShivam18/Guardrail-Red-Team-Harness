import requests
import json

def trigger_drift():
    url = "http://localhost:8000/api/analyze-drift"

    # Baseline token probability distribution (e.g., standard conversational English)
    baseline_distribution = [
        0.20, 0.15, 0.12, 0.10, 0.08, 0.07, 0.06, 0.05, 0.05, 0.04, 0.04, 0.02, 0.02
    ]

    # Actively degrading production distribution (e.g., heavily skewed, repetitive)
    # Guaranteed to yield a high KL Divergence (> 0.15)
    live_distribution = [
        0.85, 0.05, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.00, 0.00, 0.00, 0.00
    ]

    payload = {
        "baseline_distribution": baseline_distribution,
        "live_distribution": live_distribution,
        "model_id": "production-llm",
        "model_version": "1.0.0"
    }

    print(f"Triggering statistical drift simulation to {url}...")
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        
        if response.status_code == 200:
            print("Successfully triggered drift simulation.")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Failed to trigger drift simulation. HTTP {response.status_code}")
            print(response.text)
            
    except requests.exceptions.RequestException as e:
        print(f"Error connecting to the endpoint: {e}")

if __name__ == "__main__":
    trigger_drift()
