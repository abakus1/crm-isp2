# crm/adapters/mail/smtp_mailer.py
from __future__ import annotations

import smtplib
import os
import ssl
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Optional

from crm.app.config import Settings


class MailerError(RuntimeError):
    """Raised when sending email fails (without leaking secrets)."""


@dataclass(frozen=True)
class SmtpMailer:
    settings: Settings
    timeout_seconds: int = 15

    def _assert_enabled(self) -> None:
        if not self.settings.smtp_enabled:
            raise MailerError("SMTP is disabled (SMTP_ENABLED=0).")

    def _build_message(self, to_email: str, subject: str, body_text: str) -> EmailMessage:
        msg = EmailMessage()
        msg["From"] = self.settings.smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body_text)
        return msg

    def _send(self, msg: EmailMessage) -> None:
        self._assert_enabled()

        host = self.settings.smtp_host
        port = self.settings.smtp_port
        user = self.settings.smtp_user
        password = self.settings.smtp_pass
        starttls = self.settings.smtp_starttls

        # Prefer a stable, valid FQDN for EHLO/HELO to satisfy Postfix helo checks.
        ehlo_name = os.getenv("SMTP_EHLO_NAME", "").strip() or "crm.gemini.net.pl"

        try:
            with smtplib.SMTP(host=host, port=port, timeout=self.timeout_seconds) as smtp:
                smtp.ehlo(ehlo_name)
                if starttls:
                    ctx = ssl.create_default_context()
                    smtp.starttls(context=ctx)
                    smtp.ehlo(ehlo_name)
                if user:
                    smtp.login(user, password)
                smtp.send_message(msg)
        except (smtplib.SMTPException, OSError) as e:
            raise MailerError(f"SMTP send failed: {type(e).__name__}") from e


    # --- Public templates ---

    def send_staff_invite(self, to_email: str, username: str, temp_password: str) -> None:
        subject = "CRM Gemini — konto pracownika: dane do pierwszego logowania"
        body = (
            "Cześć!\n\n"
            "Dodano Ci konto pracownika w systemie CRM Gemini.\n\n"
            f"Login: {username}\n"
            f"Hasło tymczasowe: {temp_password}\n\n"
            "Pierwsze logowanie uruchomi tryb setup:\n"
            "1) zmiana hasła\n"
            "2) konfiguracja TOTP (2FA)\n"
            "Po zakończeniu setup musisz zalogować się ponownie.\n\n"
            "Jeśli to nie Ty — zignoruj tę wiadomość i skontaktuj się z administratorem.\n"
        )
        msg = self._build_message(to_email, subject, body)
        self._send(msg)

    def send_staff_reset_password(self, to_email: str, username: str, temp_password: str) -> None:
        subject = "CRM Gemini — zresetowano hasło (tymczasowe)"
        body = (
            "Cześć!\n\n"
            "Administrator zresetował Twoje hasło w CRM Gemini.\n\n"
            f"Login: {username}\n"
            f"Nowe hasło tymczasowe: {temp_password}\n\n"
            "Po zalogowaniu system wymusi zmianę hasła i ponowną konfigurację sesji.\n\n"
            "Jeśli to nie Ty — pilnie skontaktuj się z administratorem.\n"
        )
        msg = self._build_message(to_email, subject, body)
        self._send(msg)

    def send_staff_reset_totp(self, to_email: str, username: str) -> None:
        subject = "CRM Gemini — zresetowano TOTP (2FA)"
        body = (
            "Cześć!\n\n"
            "Administrator zresetował Twoje TOTP (2FA) w CRM Gemini.\n\n"
            f"Login: {username}\n\n"
            "Przy kolejnym logowaniu system poprosi o ponowną konfigurację TOTP.\n\n"
            "Jeśli to nie Ty — pilnie skontaktuj się z administratorem.\n"
        )
        msg = self._build_message(to_email, subject, body)
        self._send(msg)


def get_mailer(settings: Settings) -> Optional[SmtpMailer]:
    """
    Convenience factory. Returns None when SMTP is disabled.
    Keeps calling code clean and prevents accidental sends in dev.
    """
    if not settings.smtp_enabled:
        return None
    return SmtpMailer(settings=settings)
