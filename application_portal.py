import os, re, smtplib
from email.message import EmailMessage
from flask import Flask, render_template, request, flash, redirect, url_for
from flask_wtf.csrf import CSRFProtect
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv

load_dotenv()
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-before-production")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024
CSRFProtect(app)
limiter = Limiter(get_remote_address, app=app, default_limits=["100 per hour"],
                  storage_uri=os.getenv("RATELIMIT_STORAGE_URI", "memory://"))

def send_application(data):
    msg = EmailMessage()
    msg["Subject"] = "Neue Bewerbung – ROTHSHILD"
    msg["From"] = os.environ["SMTP_USER"]
    msg["To"] = os.environ["ADMIN_EMAIL"]
    msg.set_content("\n".join(f"{k}:\n{v}" for k, v in data.items()))
    with smtplib.SMTP(os.environ["SMTP_HOST"], int(os.getenv("SMTP_PORT", "587")), timeout=15) as smtp:
        smtp.starttls()
        smtp.login(os.environ["SMTP_USER"], os.environ["SMTP_PASSWORD"])
        smtp.send_message(msg)

@app.route("/", methods=["GET", "POST"])
@app.route("/bewerbung", methods=["GET", "POST"])
@limiter.limit("5 per hour")
def application():
    if request.method == "POST":
        data = {k: request.form.get(k, "").strip() for k in ("name", "email", "address", "goals", "motivation")}
        if not all(data.values()) or len(data["name"]) > 150 or len(data["email"]) > 254 or len(data["address"]) > 500 or len(data["goals"]) > 5000 or len(data["motivation"]) > 5000 or not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", data["email"]):
            flash("Bitte prüfe deine Eingaben und fülle alle Pflichtfelder aus.", "error")
            return render_template("application.html")
        try:
            send_application(data)
            flash("Deine Bewerbung wurde übermittelt.", "success")
            return redirect(url_for("application"))
        except Exception:
            app.logger.exception("Bewerbungsversand fehlgeschlagen")
            flash("Die Übermittlung ist momentan nicht möglich. Bitte versuche es später erneut.", "error")
    return render_template("application.html")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", "5000")), debug=False)
