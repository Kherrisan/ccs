# AI Review System

This repository uses parallel AI code review. Three focused reviewers run simultaneously:

1. **Security Review** — `.github/review-prompts/security.md`
2. **Quality Review** — `.github/review-prompts/quality.md`
3. **CCS Compliance Review** — `.github/review-prompts/ccs-compliance.md`

Reviews are orchestrated by `.github/workflows/ai-review.yml` using parallel GitHub Actions jobs.
Each reviewer runs independently via `claude-code-action@v1`, and results are merged into a single PR comment.
