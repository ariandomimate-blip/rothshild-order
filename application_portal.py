import os
from flask import Flask, jsonify, redirect

app = Flask(__name__)

# One canonical application form is hosted by the main Rothshild website.
APPLICATION_FORM_URL = os.getenv(
    "APPLICATION_FORM_URL",
    "https://the-house-of-rothshild-illuminati.onrender.com/bewerbung.html"
)

@app.get("/health")
def health():
    return jsonify({"ok": True, "service": "rothshild-application-portal"})

@app.route("/", defaults={"path": ""}, methods=["GET", "HEAD"])
@app.route("/<path:path>", methods=["GET", "HEAD"])
def forward_to_canonical_application(path):
    # Keep old links working, but never render a second copy of the form.
    return redirect(APPLICATION_FORM_URL, code=302)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
