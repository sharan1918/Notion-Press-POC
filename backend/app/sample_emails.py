import uuid
import threading
from datetime import datetime, timedelta
from app.models import Email
from app.config import MAX_CUSTOM_EMAILS

# Realistic staggered time offsets for all 10 sample emails
SAMPLE_EMAIL_OFFSETS = [
    timedelta(minutes=8),                   # Priya: 8 mins ago
    timedelta(minutes=27),                  # Rahul: 27 mins ago
    timedelta(hours=1, minutes=14),         # Anita: 1h 14m ago
    timedelta(hours=2, minutes=45),         # Vikram: 2h 45m ago
    timedelta(hours=4, minutes=20),         # Meera: 4h 20m ago
    timedelta(hours=7, minutes=50),         # Karthik: 7h 50m ago
    timedelta(days=1, hours=2, minutes=15), # Newcomer: Yesterday evening
    timedelta(days=1, hours=7, minutes=30), # Angry Author: Yesterday afternoon
    timedelta(days=2, hours=4, minutes=10), # SpamBot: 2 days ago
    timedelta(days=3, hours=8, minutes=25), # Deepa: 3 days ago
]

SAMPLE_EMAILS_RAW = [
    {
        "id": "1",
        "sender": "priya.sharma@example.com",
        "sender_name": "Priya Sharma",
        "subject": "Royalties not credited for June",
        "body": "Hi team, I haven't received my royalty payout for the month of June. It was supposed to be credited by the 5th. Can you please check?",
    },
    {
        "id": "2",
        "sender": "rahul.menon@example.com",
        "sender_name": "Rahul Menon",
        "subject": "When will my book go live?",
        "body": "Hello, I approved the final proof two days ago. When will my book be available for purchase on Amazon?",
    },
    {
        "id": "3",
        "sender": "anita.desai@example.com",
        "sender_name": "Anita Desai",
        "subject": "URGENT: Pages smudged in my book",
        "body": "I just received my author copies and the printing quality is terrible! Pages 45-50 are completely smudged and unreadable. This is unacceptable.",
    },
    {
        "id": "4",
        "sender": "vikram.seth@example.com",
        "sender_name": "Vikram Seth",
        "subject": "Need to change my book cover",
        "body": "Hi, I have a new cover design for my upcoming book. Can you please update the file before it goes to print?",
    },
    {
        "id": "5",
        "sender": "meera.nair@example.com",
        "sender_name": "Meera Nair",
        "subject": "Book not showing on Flipkart",
        "body": "My book has been live on your store for a week, but I still can't find it on Flipkart. Is there a delay in distribution?",
    },
    {
        "id": "6",
        "sender": "karthik.s@example.com",
        "sender_name": "Karthik Subramanian",
        "subject": "Wrong ISBN on my published book!!",
        "body": "I am shocked to see that the ISBN printed on my physical book does not match the one registered. Please fix this immediately, this is a major error.",
    },
    {
        "id": "7",
        "sender": "new.author@example.com",
        "sender_name": "Newcomer Author",
        "subject": "How do I start self-publishing?",
        "body": "Hi Notion Press, I have a manuscript ready and I want to self-publish. What are the steps to get started?",
    },
    {
        "id": "8",
        "sender": "angry.author@example.com",
        "sender_name": "Angry Author",
        "subject": "I've waited 3 months, unacceptable!",
        "body": "I have been waiting for 3 months and there is still no resolution. I demand to speak to a manager right now!",
    },
    {
        "id": "9",
        "sender": "spambot@spamservices.com",
        "sender_name": "SpamBot Inc",
        "subject": "Boost your book sales with SEO!",
        "body": "Want to be a bestseller? Buy our guaranteed SEO services for just $99. Click here to increase your rankings.",
    },
    {
        "id": "10",
        "sender": "deepa.k@example.com",
        "sender_name": "Deepa Krishnan",
        "subject": "Royalties wrong + book not on Amazon",
        "body": "My royalty report for last month seems incorrect, and on top of that, my book is out of stock on Amazon. What is going on?",
    }
]

def _generate_sample_emails() -> list[dict]:
    now = datetime.now()
    emails = []
    for i, data in enumerate(SAMPLE_EMAILS_RAW):
        offset = SAMPLE_EMAIL_OFFSETS[i] if i < len(SAMPLE_EMAIL_OFFSETS) else timedelta(hours=i * 2)
        email_dict = dict(data)
        email_dict["timestamp"] = (now - offset).isoformat()
        emails.append(email_dict)
    return emails

SAMPLE_EMAILS = _generate_sample_emails()

CUSTOM_EMAILS: list[dict] = []
_email_lock = threading.Lock()

def add_custom_email(sender_name: str, sender: str, subject: str, body: str) -> Email:
    new_email_data = {
        "id": f"mail_{uuid.uuid4().hex}",
        "sender": sender.strip(),
        "sender_name": sender_name.strip(),
        "subject": subject.strip(),
        "body": body.strip(),
        "timestamp": datetime.now().isoformat()
    }
    with _email_lock:
        CUSTOM_EMAILS.insert(0, new_email_data)
        if len(CUSTOM_EMAILS) > MAX_CUSTOM_EMAILS:
            CUSTOM_EMAILS.pop()
    return Email(**new_email_data)

def get_all_emails() -> list[dict]:
    with _email_lock:
        # Fixed sample timestamps generated on server launch; stable across browser refreshes
        return list(CUSTOM_EMAILS) + list(SAMPLE_EMAILS)

def get_sample_email(email_id: str) -> Email:
    with _email_lock:
        for data in CUSTOM_EMAILS:
            if data["id"] == email_id:
                return Email(**data)
        for data in SAMPLE_EMAILS:
            if data["id"] == email_id:
                return Email(**data)
    raise ValueError(f"Email with ID {email_id} not found")
