from fastapi import FastAPI

from crm.sms.module import register as register_sms
from crm.users.module import register as register_users

app = FastAPI(title="CRM ISP - Modular Structure")

# Register modules
register_users(app)
register_sms(app)
