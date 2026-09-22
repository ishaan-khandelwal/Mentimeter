import { Router } from 'express';

const router = Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'pollwave-server', timestamp: new Date().toISOString() });
});

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'pollwave-server', timestamp: new Date().toISOString() });
});

export default router;
