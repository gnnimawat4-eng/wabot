require('dotenv').config();
const Fastify = require('fastify');

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

app.register(require('@fastify/cors'), {
  origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
  credentials: true,
});
app.register(require('@fastify/formbody'));
app.register(require('@fastify/jwt'), { secret: process.env.JWT_SECRET || 'dev-secret' });
app.register(require('@fastify/multipart'), { limits: { fileSize: 5 * 1024 * 1024 } });

app.decorate('authenticate', async (req, reply) => {
  try {
    await req.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized' });
  }
});

app.get('/health', async () => ({ status: 'ok', ts: Date.now() }));

app.register(require('./routes/webhook'), { prefix: '/webhook' });
app.register(require('./routes/workspaces'), { prefix: '/workspaces' });
app.register(require('./routes/contacts'), { prefix: '/workspaces' });
app.register(require('./routes/flows'), { prefix: '/workspaces' });
app.register(require('./routes/broadcasts'), { prefix: '/workspaces' });
app.register(require('./routes/billing'), { prefix: '/billing' });

const start = async () => {
  try {
    await app.listen({ port: parseInt(process.env.PORT || '3001'), host: '0.0.0.0' });
    console.log(`WaBot backend running on port ${process.env.PORT || 3001}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
