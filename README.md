# Flowstock

Flowstock is a local web prototype for AI-assisted replenishment planning.

## Run locally

1. Open Terminal in this project folder.
2. Install the project packages:

   ```bash
   npm install
   ```

3. Start the local website:

   ```bash
   npm run dev
   ```

4. Open the browser address shown by Terminal, usually:

   ```text
   http://localhost:3000
   ```

The app reads CSV files from `data/seed/replenishment_mock_csv_package` and writes approved runs under `data/runs`.
