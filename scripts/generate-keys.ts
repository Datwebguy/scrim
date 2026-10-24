// Prints two fresh secrets for Scrim. Put them in your host's environment settings, never in git.
import { randomBytes } from "node:crypto";

const key = () => randomBytes(32).toString("base64");
console.log(`SCRIM_SECRET_KEY=${key()}   # seals private records at rest`);
console.log(`SCRIM_PROOF_KEY=${key()}    # signs proofs; keep it safe, anyone holding it can forge proofs`);
