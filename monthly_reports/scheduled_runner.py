"""Date-aware wrapper that calls generate_monthly_reports.py when it's due.
 
- On the 4th of every month: generate PREVIOUS month's team reports.
- On the 1st day of Jan / Apr / Jul / Oct: generate PREVIOUS quarter's report.
- Otherwise: do nothing.
 
Intended to be called from the GitHub Actions daily workflow.
"""
import subprocess, sys
from datetime import date
from pathlib import Path
 
SCRIPT = Path(__file__).resolve().parent / "generate_monthly_reports.py"
today = date.today()
 
def run(args):
    print(f"  running: python {SCRIPT.name} {' '.join(args)}")
    subprocess.check_call([sys.executable, str(SCRIPT), *args])
 
ran_anything = False
 
if today.day == 4:
    prev = today.replace(day=1) - __import__("datetime").timedelta(days=1)
    tag = f"{prev.year}-{prev.month:02d}"
    print(f"[scheduled_runner] 4th of month -> generating monthly reports for {tag}")
    run(["--month", tag])
    ran_anything = True
 
if today.day == 1 and today.month in (1, 4, 7, 10):
    pq = {1: ("Q4", today.year-1), 4: ("Q1", today.year),
          7: ("Q2", today.year), 10: ("Q3", today.year)}[today.month]
    tag = f"{pq[0]}-{pq[1]}"
    print(f"[scheduled_runner] quarter-start -> generating quarterly report {tag}")
    run(["--quarter", tag])
    ran_anything = True
 
if not ran_anything:
    print(f"[scheduled_runner] {today} — no reports due today, skipping.")
