import { autumnHandler } from "autumn-js/next";

import { env } from "@/env";
import { auth } from "@/server/auth";

const handler = autumnHandler({
  secretKey: env.AUTUMN_SECRET_KEY,
  identify: async (request) => {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return null;
    }
    return {
      customerId: session.user.id,
      customerData: {
        name: session.user.name ?? undefined,
        email: session.user.email,
      },
    };
  },
});

export const { GET, POST, DELETE } = handler;
