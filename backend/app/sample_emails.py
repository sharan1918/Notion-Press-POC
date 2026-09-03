from datetime import datetime
from app.models import Email

SAMPLE_EMAILS = [
    {
        "id": "1",
        "sender": "priya.sharma@example.com",
        "sender_name": "Priya Sharma",
        "subject": "Royalties not credited for June",
        "body": "Hi team, I haven't received my royalty payout for the month of June. It was supposed to be credited by the 5th. Can you please check?",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "2",
        "sender": "rahul.menon@example.com",
        "sender_name": "Rahul Menon",
        "subject": "When will my book go live?",
        "body": "Hello, I approved the final proof two days ago. When will my book be available for purchase on Amazon?",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "3",
        "sender": "anita.desai@example.com",
        "sender_name": "Anita Desai",
        "subject": "URGENT: Pages smudged in my book",
        "body": "I just received my author copies and the printing quality is terrible! Pages 45-50 are completely smudged and unreadable. This is unacceptable.",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "4",
        "sender": "vikram.seth@example.com",
        "sender_name": "Vikram Seth",
        "subject": "Need to change my book cover",
        "body": "Hi, I have a new cover design for my upcoming book. Can you please update the file before it goes to print?",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "5",
        "sender": "meera.nair@example.com",
        "sender_name": "Meera Nair",
        "subject": "Book not showing on Flipkart",
        "body": "My book has been live on your store for a week, but I still can't find it on Flipkart. Is there a delay in distribution?",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "6",
        "sender": "karthik.s@example.com",
        "sender_name": "Karthik Subramanian",
        "subject": "Wrong ISBN on my published book!!",
        "body": "I am shocked to see that the ISBN printed on my physical book does not match the one registered. Please fix this immediately, this is a major error.",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "7",
        "sender": "new.author@example.com",
        "sender_name": "Newcomer Author",
        "subject": "How do I start self-publishing?",
        "body": "Hi Notion Press, I have a manuscript ready and I want to self-publish. What are the steps to get started?",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "8",
        "sender": "angry.author@example.com",
        "sender_name": "Angry Author",
        "subject": "I've waited 3 months, unacceptable!",
        "body": "I have been waiting for 3 months and there is still no resolution. I demand to speak to a manager right now!",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "9",
        "sender": "spambot@spamservices.com",
        "sender_name": "SpamBot Inc",
        "subject": "Boost your book sales with SEO!",
        "body": "Want to be a bestseller? Buy our guaranteed SEO services for just $99. Click here to increase your rankings.",
        "timestamp": datetime.now().isoformat()
    },
    {
        "id": "10",
        "sender": "deepa.k@example.com",
        "sender_name": "Deepa Krishnan",
        "subject": "Royalties wrong + book not on Amazon",
        "body": "My royalty report for last month seems incorrect, and on top of that, my book is out of stock on Amazon. What is going on?",
        "timestamp": datetime.now().isoformat()
    }
]

CUSTOM_EMAILS: list[dict] = []

def add_custom_email(sender_name: str, sender: str, subject: str, body: str) -> Email:
    import uuid
    new_email_data = {
        "id": f"mail_{uuid.uuid4().hex[:8]}",
        "sender": sender.strip(),
        "sender_name": sender_name.strip(),
        "subject": subject.strip(),
        "body": body.strip(),
        "timestamp": datetime.now().isoformat()
    }
    CUSTOM_EMAILS.insert(0, new_email_data)
    return Email(**new_email_data)

def get_all_emails() -> list[dict]:
    return list(CUSTOM_EMAILS) + list(SAMPLE_EMAILS)

def get_sample_email(email_id: str) -> Email:
    for data in CUSTOM_EMAILS:
        if data["id"] == email_id:
            return Email(**data)
    for data in SAMPLE_EMAILS:
        if data["id"] == email_id:
            return Email(**data)
    raise ValueError(f"Email with ID {email_id} not found")
