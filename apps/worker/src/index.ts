/**
 * Outbox worker entrypoint. Importing the backend worker module starts the
 * polling loop (it is a plain side-effecting script); this thin package only
 * exists so the worker can be deployed as its own Railway service from the
 * same monorepo, sharing all configuration and code with the API.
 */
import "@pgrs/backend/worker";
