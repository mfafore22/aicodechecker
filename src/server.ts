// Starts the webhook server. Settings come from .env (see .env.example).
// With no APP_ID or private key set, Probot opens a setup page that creates the GitHub App for you.

import { run } from "probot";
import app from "./index.js";

await run(app);
