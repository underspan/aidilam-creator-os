# YouTube Owner Setup Guide

## Prerequisites (Owner Decisions Required)
1. Google account for Cloud project ownership
2. Google Cloud project name
3. OAuth consent screen: internal or external
4. Redirect URI for authorization flow
5. First pilot YouTube channel
6. Privacy default: private (recommended for pilot)
7. Delete permission policy
8. Quota alert thresholds
9. Secret-store backend selection
10. Target date for first real test upload

## Steps (to be executed by owner)
1. Create Google Cloud project
2. Enable YouTube Data API v3
3. Configure OAuth consent screen
4. Create OAuth 2.0 client credentials (web application type)
5. Set authorized redirect URIs
6. Store client_id in config
7. Store client_secret in approved secret store
8. Authorize first channel via consent flow
9. Store refresh_token via approved secret store
10. Configure account binding in AIĐiLàm

## NOT to be done by CI/automation:
- Creating Google Cloud projects
- Accepting Terms of Service
- Configuring consent screens
- First-time authorization
