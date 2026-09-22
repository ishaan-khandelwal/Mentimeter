import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@pollwave/shared';
import { z } from 'zod';

const ReorderSchema = z.object({
  slideIds: z.array(z.string()).min(1),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;

  // Verify ownership
  const presentation = await prisma.presentation.findUnique({
    where: { id: params.id },
  });

  if (!presentation || presentation.ownerId !== userId) {
    return NextResponse.json({ error: 'Presentation not found' }, { status: 404 });
  }

  const body = await req.json();
  const parsed = ReorderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  }

  const { slideIds } = parsed.data;

  // Batch update slide orders in a single transaction
  await prisma.$transaction(
    slideIds.map((slideId: string, index: number) =>
      prisma.slide.update({
        where: { id: slideId },
        data: { order: index },
      }),
    ),
  );

  return NextResponse.json({ success: true, count: slideIds.length });
}
