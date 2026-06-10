# Stack choice

2026-01-15 — We chose PostgreSQL over MongoDB for the main store. Relational
fits our billing model, and the team knows it. We took the pgvector extension
for embeddings instead of a separate vector database.
