# Tracking Templates
## Copy these into Google Sheets

---

## 1. WEDDING & REVIEW TRACKER

### Sheet: "2026 Weddings"

| Column | Description |
|--------|-------------|
| A: Wedding Date | Date of wedding |
| B: Couple Names | "Sarah & Tom" |
| C: Venue | "Ashford Castle" |
| D: Email | couple@email.com |
| E: Phone | 087 XXX XXXX |
| F: Package | "Premium" / "Essentials" |
| G: Revenue | €3,200 |
| H: Deposit Paid | Date |
| I: Balance Paid | Date |
| J: Email 1 Sent | ✓ or date |
| K: Email 2 Sent | ✓ or date |
| L: Email 3 Sent | ✓ or date |
| M: Email 4 Sent | ✓ or date |
| N: Review Left? | YES / NO |
| O: Review Link | URL |
| P: Content Permission | YES / NO / PARTIAL |
| Q: Content Captured | List what you filmed |
| R: Venue Coordinator | Name |
| S: Thank You Card Sent | ✓ or date |
| T: Notes | Any special details |

### Formulas to Add:
- Review Rate: `=COUNTIF(N:N,"YES")/COUNTA(A:A)*100`
- Total Revenue: `=SUM(G:G)`
- Outstanding Balance: `=SUMIF(I:I,"",G:G)-SUMIF(H:H,"<>",0)`

---

## 2. ENQUIRY PIPELINE

### Sheet: "Enquiries 2026"

| Column | Description |
|--------|-------------|
| A: Enquiry Date | When they first contacted |
| B: Source | WeddingsOnline / Google / Instagram / Referral / Showcase |
| C: Couple Names | "Sarah & Tom" |
| D: Email | couple@email.com |
| E: Phone | 087 XXX XXXX |
| F: Wedding Date | Their date |
| G: Venue | Where they're getting married |
| H: Status | NEW / CONTACTED / CALL BOOKED / QUOTED / WON / LOST |
| I: First Response | Date/time of your first reply |
| J: Response Time | Hours between enquiry and response |
| K: Call Date | If you scheduled a call |
| L: Quote Sent | Date |
| M: Quote Amount | €3,200 |
| N: Follow Up 1 | Date |
| O: Follow Up 2 | Date |
| P: Follow Up 3 | Date |
| Q: Outcome Date | When they booked or declined |
| R: Lost Reason | "Booked elsewhere" / "Budget" / "No response" |
| S: Referral From | Who referred them (if applicable) |
| T: Notes | |

### Key Metrics (Add as separate section):
- Total Enquiries: `=COUNTA(A:A)-1`
- Conversion Rate: `=COUNTIF(H:H,"WON")/(COUNTIF(H:H,"WON")+COUNTIF(H:H,"LOST"))*100`
- Avg Response Time: `=AVERAGE(J:J)`
- By Source: Use COUNTIF for each source

---

## 3. SHOWCASE TRACKER

### Sheet: "Showcases"

| Column | Description |
|--------|-------------|
| A: Showcase Date | Date of showcase |
| B: Venue | Where held |
| C: Total RSVPs | Number who RSVP'd |
| D: Actual Attendees | Number who showed up |
| E: Bookings Same Night | Number who booked at showcase |
| F: Bookings Within 7 Days | Number who booked within week |
| G: Bookings Within 30 Days | Number who booked within month |
| H: Revenue Generated | Total from showcase bookings |
| I: Cost | Venue hire, drinks, etc |
| J: Net ROI | Revenue - Cost |
| K: Show Rate | Attendees / RSVPs |
| L: Conversion Rate | Total Bookings / Attendees |

### Attendee Sub-Sheet: "Showcase - [Date]"

| Column | Description |
|--------|-------------|
| A: Names | "Sarah & Tom" |
| B: Email | |
| C: Phone | |
| D: Wedding Date | |
| E: Venue | |
| F: Attended? | YES / NO |
| G: Temperature | HOT / WARM / COLD |
| H: Follow Up 1 Sent | Date |
| I: Follow Up 2 Sent | Date |
| J: Booked? | YES / NO |
| K: Booking Date | |
| L: Notes | |

---

## 4. VENUE COORDINATOR CRM

### Sheet: "Venue Relationships"

| Column | Description |
|--------|-------------|
| A: Venue Name | "Ashford Castle" |
| B: Coordinator Name | "Mary Smith" |
| C: Email | mary@ashfordcastle.com |
| D: Phone | |
| E: Times Played There | 12 |
| F: Last Played | Date |
| G: Relationship Status | STRONG / GOOD / NEW / COLD |
| H: On Recommend List? | YES / NO / UNKNOWN |
| I: Last Contact | Date |
| J: Last Thank You Card | Date |
| K: Open Day Offered? | YES / NO |
| L: Open Day Played? | Date if yes |
| M: Next Action | "Send quarterly check-in" |
| N: Next Action Date | When to do it |
| O: Notes | |

---

## 5. MONTHLY METRICS DASHBOARD

### Sheet: "Monthly Metrics"

| Metric | Jan | Feb | Mar | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Total |
|--------|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-------|
| Weddings Played | | | | | | | | | | | | | |
| Revenue | | | | | | | | | | | | | |
| New Enquiries | | | | | | | | | | | | | |
| - From WeddingsOnline | | | | | | | | | | | | | |
| - From Google/Website | | | | | | | | | | | | | |
| - From Instagram | | | | | | | | | | | | | |
| - From Referrals | | | | | | | | | | | | | |
| - From Showcases | | | | | | | | | | | | | |
| Bookings Made | | | | | | | | | | | | | |
| Enquiry→Booking Rate | | | | | | | | | | | | | |
| New WeddingsOnline Reviews | | | | | | | | | | | | | |
| Total WO Reviews | | | | | | | | | | | | | |
| Instagram Followers | | | | | | | | | | | | | |
| Instagram Posts | | | | | | | | | | | | | |
| Showcases Held | | | | | | | | | | | | | |
| Venue Cards Sent | | | | | | | | | | | | | |

---

## 6. INSTAGRAM CONTENT CALENDAR

### Sheet: "Content Calendar"

| Column | Description |
|--------|-------------|
| A: Date | Post date |
| B: Day | Monday/Tuesday/etc |
| C: Content Type | Reel / Carousel / Story / Static |
| D: Topic | "First dance at Ashford" |
| E: Caption | Full caption text |
| F: Hashtags | Copy-paste hashtag set |
| G: Source Wedding | Which wedding is this from |
| H: Status | IDEA / FILMING / EDITING / SCHEDULED / POSTED |
| I: Posted Time | What time posted |
| J: Likes | |
| K: Comments | |
| L: Saves | |
| M: Shares | |
| N: Reach | |
| O: Notes | What worked/didn't |

### Content Bank Sub-Sheet

| Column | Description |
|--------|-------------|
| A: Wedding Date | |
| B: Venue | |
| C: Couple Names | |
| D: Permission Level | FULL / NO FACES / NONE |
| E: Content Captured | "First dance, dancefloor x3, setup" |
| F: Best Clips | "Dancefloor clip 2 is fire" |
| G: Used In Posts | Links to posts where used |
| H: Notes | |

---

## 7. REFERRAL TRACKER

### Sheet: "Referrals"

| Column | Description |
|--------|-------------|
| A: Referrer Names | Who referred |
| B: Referrer Email | |
| C: Wedding Date | When they got married |
| D: Referred Couple | Who they referred |
| E: Referred Email | |
| F: Referral Date | When referral came in |
| G: Booked? | YES / NO / PENDING |
| H: Booking Date | |
| I: Booking Value | |
| J: Referrer Reward Sent | Date |
| K: Reward Type | Cash / Voucher |
| L: Notes | |

---

## QUICK SETUP CHECKLIST

1. [ ] Create Google Sheet called "Beat Boutique Master Tracker"
2. [ ] Add all sheets above as tabs
3. [ ] Apply conditional formatting:
   - Red: Status = "LOST" or Review = "NO" (after 30 days)
   - Yellow: Needs follow-up
   - Green: Status = "WON" or Review = "YES"
4. [ ] Set up filters on each sheet
5. [ ] Share with all band members (view or edit access)
6. [ ] Bookmark for quick access
7. [ ] Set calendar reminder: Update every Monday

---

## AUTOMATION IDEAS (Future)

If you want to automate:

1. **Zapier/Make workflows:**
   - WeddingsOnline enquiry → Add to Google Sheet
   - New booking → Trigger review email sequence
   - Showcase RSVP → Add to attendee list

2. **Email automation (Mailchimp/ConvertKit):**
   - Review request sequence (4 emails)
   - Enquiry nurture sequence
   - Post-showcase sequence

3. **Calendar integration:**
   - Wedding dates auto-added to shared calendar
   - Reminder for review emails
   - Reminder for venue thank-you cards
