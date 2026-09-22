import { Router, Request, Response } from 'express';
import { prisma } from '@pollwave/shared';
import { requirePresenterAuth, PresenterJWTPayload } from '../middlewares/auth';
import { validate } from '../middlewares/validate';
import { z } from 'zod';

const router = Router();

// GET /api/v1/join/:code - resolve join code to session info
router.get('/join/:code', async (req: Request, res: Response) => {
  try {
    const joinCode = req.params.code.toUpperCase();
    const presentation = await prisma.presentation.findFirst({
      where: { joinCode, status: 'live' },
    });

    if (!presentation) {
      res.status(404).json({ error: 'No active session found for this code' });
      return;
    }

    const session = await prisma.session.findFirst({
      where: {
        presentationId: presentation.id,
        status: 'active',
      },
    });

    if (!session) {
      res.status(404).json({ error: 'Session not active' });
      return;
    }

    const slides = await prisma.slide.findMany({
      where: { presentationId: presentation.id },
      orderBy: { order: 'asc' },
    });

    res.json({
      sessionId: session.id,
      presentationId: presentation.id,
      title: presentation.title,
      currentSlideId: session.currentSlideId,
      votingLocked: session.votingLocked,
      slides: slides.map((s) => ({
        _id: s.id,
        type: s.type,
        question: s.question,
        options: Array.isArray(s.options) ? (s.options as string[]) : [],
        order: s.order,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/sessions/:id - get session state
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await prisma.session.findUnique({
      where: { id: req.params.id },
    });
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json(session);
  } catch {
    res.status(500).json({ error: 'Internal server error' });
  }
});

const StartSessionSchema = z.object({
  presentationId: z.string().min(1),
});

// POST /api/v1/sessions - start a new session (auth required)
router.post(
  '/sessions',
  requirePresenterAuth,
  validate(StartSessionSchema),
  async (req: Request, res: Response) => {
    try {
      const { presentationId } = req.body;

      // Verify presenter owns the presentation
      const presenter = (req as Request & { presenter?: PresenterJWTPayload }).presenter;
      if (!presenter) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const presentation = await prisma.presentation.findUnique({
        where: { id: presentationId },
      });

      if (!presentation || presentation.ownerId !== presenter.userId) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }

      // End any existing active session
      await prisma.session.updateMany({
        where: { presentationId, status: 'active' },
        data: { status: 'ended', endedAt: new Date() },
      });

      const slides = await prisma.slide.findMany({
        where: { presentationId },
        orderBy: { order: 'asc' },
      });

      if (slides.length === 0) {
        res.status(400).json({ error: 'Add slides before starting a session' });
        return;
      }

      const session = await prisma.session.create({
        data: {
          presentationId,
          currentSlideId: slides[0].id,
          status: 'active',
          votingLocked: false,
        },
      });

      await prisma.presentation.update({
        where: { id: presentationId },
        data: { status: 'live' },
      });

      res.status(201).json({ sessionId: session.id });
    } catch (err) {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// PATCH /api/v1/sessions/:id/end - end a session (auth required)
router.patch(
  '/sessions/:id/end',
  requirePresenterAuth,
  async (req: Request, res: Response) => {
    try {
      const session = await prisma.session.findUnique({
        where: { id: req.params.id },
      });

      if (!session) {
        res.status(404).json({ error: 'Session not found' });
        return;
      }

      await prisma.session.update({
        where: { id: req.params.id },
        data: { status: 'ended', endedAt: new Date() },
      });

      await prisma.presentation.update({
        where: { id: session.presentationId },
        data: { status: 'ended' },
      });

      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
