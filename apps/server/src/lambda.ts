import { handle } from "hono/aws-lambda";
import { app } from "./app";

// AWS Lambda entry. Wraps the shared Hono app with the AWS Lambda v2
// streaming response adapter. Bundled into dist/lambda.mjs as a single
// self-contained file (all workspace + node_modules deps inlined) so
// the deployment artifact needs no node_modules upload.
export const handler = handle(app);