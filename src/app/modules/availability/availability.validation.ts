import { z } from 'zod';

const shiftTypeEnum = z.enum(['MORNING', 'AFTERNOON', 'EVENING', 'NIGHT']);

export const addShiftSchema = z.object({
  body: z
    .object({
      date: z
        .string()
        .date('date must be in YYYY-MM-DD format (UTC)')
        .refine(
          (data) =>
            new Date(data).getTime() >=
            new Date(new Date().setUTCHours(0, 0, 0, 0)).getTime(),
          {
            message: 'Date can not be in the past',
          },
        ),

      shiftType: shiftTypeEnum,

      startTime: z
        .string()
        .time({ message: 'startTime must be in HH:MM format (24h UTC)' }),

      endTime: z
        .string()
        .time({ message: 'endTime must be in HH:MM format (24h UTC)' }),
    })
    .refine(
      (data) => {
        const [sh, sm] = data.startTime.split(':').map(Number);
        const [eh, em] = data.endTime.split(':').map(Number);
        return sh * 60 + sm < eh * 60 + em;
      },
      { message: 'endTime must be after startTime (UTC 24h)' },
    )
    .refine(
      (data) => {
        const [sh] = data.startTime.split(':').map(Number);
        const [eh] = data.endTime.split(':').map(Number);
        return eh - sh >= 2;
      },
      { message: 'Shift must span at least 2 hours to generate valid 2-hour slots' },
    ),
});

export const updateShiftSchema = z.object({
  body: z
    .object({
      startTime: z
        .string()
        .time({ message: 'startTime must be in HH:MM format (24h UTC)' })
        .optional(),
      endTime: z
        .string()
        .time({ message: 'endTime must be in HH:MM format (24h UTC)' })
        .optional(),
      isAvailable: z.boolean().optional(),
    })
    .refine(
      (data) => {
        if (data.startTime && data.endTime) {
          const [sh] = data.startTime.split(':').map(Number);
          const [eh] = data.endTime.split(':').map(Number);
          return eh > sh && eh - sh >= 2;
        }
        return true;
      },
      { message: 'endTime must be after startTime and span at least 2 hours (UTC)' },
    ),
});