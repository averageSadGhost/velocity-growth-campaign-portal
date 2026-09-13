# Deployment and rollback

The patch was dry-run on the target project inside BEGIN/ROLLBACK. All 85,180 contacts were preserved and existing-row foreign-key checks passed. Existing send and share tables were empty. No existing data is deleted by hardening.sql.

Apply in one transaction, running isolation assertions before commit. On error the transaction rolls back. Once used, retain new dispatch tables because they record approvals. If deployment fails, restore the previous Vercel deployment for reads/auth and keep sends disabled until repaired forward. Do not restore insecure client write permissions. New default-privilege rules only affect future objects.
