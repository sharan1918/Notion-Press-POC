import os
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

def generate_handbook(output_path: str):
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=letter,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )
    
    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=18,
        leading=22,
        textColor=colors.HexColor('#0F172A'),
        spaceAfter=4
    )
    
    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=colors.HexColor('#475569'),
        spaceAfter=12
    )
    
    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=colors.HexColor('#0284C7'),
        spaceBefore=10,
        spaceAfter=4
    )
    
    bullet_style = ParagraphStyle(
        'BulletText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=colors.HexColor('#334155'),
        leftIndent=10,
        spaceAfter=3
    )

    story = []
    
    # Header Banner
    story.append(Paragraph("Notion Press | Author Publishing Policy Handbook", title_style))
    story.append(Paragraph("Official Author Guidelines, Royalties, ISBN, Production SLAs &amp; Distribution Standards &bull; Version 2026.2", subtitle_style))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor('#0284C7'), spaceBefore=0, spaceAfter=10))
    
    sections = [
        (
            "1. Self-Publishing Roadmap & Submission Guidelines",
            [
                "<b>5-Step Publishing Process:</b> (1) Project Creation on notionpress.com, (2) Manuscript Upload in MS Word (.docx) or print-ready PDF, (3) Cover Design upload (300 DPI CMYK), (4) Retail Pricing & Free ISBN Allocation, (5) Proof Review & Approval.",
                "<b>Supported Trim Sizes:</b> 5x8 inches, 6x9 inches (standard trade), and standard A5.",
                "<b>Publishing Timeline:</b> Standard end-to-end timeline from manuscript upload to proof approval is 7 to 14 business days.",
                "<b>DIY Publishing Cost:</b> Self-publishing on Notion Press is 100% free with no mandatory setup packages."
            ]
        ),
        (
            "2. Author Royalty Calculation & Payout Schedule",
            [
                "<b>Author Profit Formula:</b> Authors earn 100% of Net Author Profit on every copy sold across all retail channels.",
                "<b>Net Profit Calculation:</b> Net Profit = MRP &minus; Production/Printing Cost &minus; Distribution Margin.",
                "<b>Payout Cycle:</b> Royalties are calculated on a monthly calendar cycle and disbursed directly to the author's registered bank account by the 10th of every month.",
                "<b>Minimum Payout Threshold:</b> The minimum threshold is ₹1,000. Unpaid balances roll over to the subsequent month automatically.",
                "<b>Copyright & Ownership:</b> The author retains 100% copyright, intellectual property, and film/adaptation rights under a non-exclusive publishing agreement."
            ]
        ),
        (
            "3. ISBN Allocation, Barcodes & Revision Rules",
            [
                "<b>Free ISBN Assignment:</b> Free 13-digit ISBNs are assigned for paperback and eBook editions during project creation.",
                "<b>Own ISBN Usage:</b> Authors who already possess an ISBN from Raja Rammohun Roy National Agency can register it at zero charge.",
                "<b>EAN-13 Barcodes:</b> High-resolution EAN-13 barcodes are generated and printed on the lower-right back cover automatically.",
                "<b>ISBN Immutability:</b> International ISBN standards prohibit reassigning or transferring an ISBN. Revisions altering >20% text or modifying trim size require a new ISBN."
            ]
        ),
        (
            "4. Production SLAs & Go-Live Timelines Post-Proof Approval",
            [
                "<b>Proof Validation SLA:</b> Post author digital proof approval, printer spooling and pre-flight validation take 48 to 72 hours.",
                "<b>Notion Press Store:</b> The book listing goes live for purchase within 3 to 5 business days.",
                "<b>Amazon India & Flipkart Syndication:</b> Distribution feeds syndicate product listings to Amazon and Flipkart within 7 to 14 business days post proof approval.",
                "<b>Temporary Out of Stock Status:</b> Initial listings on Amazon or Flipkart may display 'Temporarily Out of Stock' for the first 24 to 48 hours while the retailer caches product metadata and barcode.",
                "<b>Hardcover Editions:</b> Require 10 to 14 business days due to casewrap binding and dry-mounting.",
                "<b>eBooks (Kindle/Kobo):</b> Go live on digital marketplaces within 3 to 5 business days."
            ]
        ),
        (
            "5. Distribution Channels, EDI Feeds & Print-on-Demand (POD)",
            [
                "<b>Domestic Channels:</b> Notion Press Store, Amazon.in, and Flipkart.",
                "<b>Marketplace Indexing Lag:</b> Metadata is transmitted via automated EDI feeds. Because external retailer search engines index asynchronously, it takes 5 to 7 business days for new titles to appear in public search results.",
                "<b>Print-on-Demand (POD) Model:</b> Books are printed per customer order within 48 hours of purchase. No physical warehouse stock is held.",
                "<b>Global Distribution:</b> Available in 150+ countries via Amazon.com (US, UK, Europe) and IngramSpark global network (activation takes 2 to 3 weeks)."
            ]
        ),
        (
            "6. Author Copy Orders & Bulk Printing Discounts",
            [
                "<b>Author Copy Pricing:</b> Authors can order personal copies anytime at direct subsidized print production cost.",
                "<b>Turnaround Time:</b> Author copies are printed and dispatched within 3 to 5 business days.",
                "<b>Volume Discounts:</b> Additional tiered bulk discounts apply for orders exceeding 50, 100, and 500 copies."
            ]
        ),
        (
            "7. Content Rights, Unpublishing & Cancellation Policy",
            [
                "<b>Unpublishing Flexibility:</b> Authors can unpublish or pause book sales anytime from the author dashboard with zero penalties.",
                "<b>Exclusive vs Non-Exclusive:</b> Notion Press is strictly non-exclusive; authors are free to publish elsewhere.",
                "<b>Editorial Compliance:</b> All manuscripts must comply with copyright law and cannot contain plagiarized or defamatory material."
            ]
        )
    ]
    
    for title, points in sections:
        story.append(Paragraph(title, section_heading))
        for pt in points:
            story.append(Paragraph(f"&bull; {pt}", bullet_style))
        story.append(Spacer(1, 3))
        
    doc.build(story)
    print(f"Generated handbook at {output_path}")

if __name__ == "__main__":
    output_file = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "sample_docs", "Notion_Press_Author_Publishing_Policy_Handbook.pdf"))
    generate_handbook(output_file)
