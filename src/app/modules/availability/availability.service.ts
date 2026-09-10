import { Types } from 'mongoose';
import { StatusCodes } from 'http-status-codes';
import ApiError from '../../../errors/ApiErrors';
import { Availability } from './availability.model';
import { ISlot, IShift, TShiftType } from './availability.interface';

function generateSlots(startTime: string, endTime: string): ISlot[] {
  const [sh] = startTime.split(':').map(Number);
  const [eh] = endTime.split(':').map(Number);
  const slots: ISlot[] = [];
  for (let h = sh; h < eh; h += 2) {
    slots.push({
      _id: new Types.ObjectId(),
      startTime: `${String(h).padStart(2, '0')}:00`,
      status: 'AVAILABLE',
      heldUntil: null,
      bookingId: null,
    });
  }
  return slots;
}

// Accepts only YYYY-MM-DD strings (guaranteed by Zod .date() validation upstream)
// Always produces UTC midnight — e.g. "2026-04-25" → 2026-04-25T00:00:00.000Z
function toUTCMidnight(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

const addShift = async (
  caregiverId: string,
  payload: { date: string; shiftType: TShiftType; startTime: string; endTime: string },
) => {
  const utcDate = toUTCMidnight(payload.date);

  let availability = await Availability.findOne({
    caregiver: new Types.ObjectId(caregiverId),
    date: utcDate,
  });

  if (availability) {
    if (availability.isDayBlocked) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        'This date is blocked due to a confirmed booking. You cannot add shifts.',
      );
    }

    const shiftExists = availability.shifts.some(
      (s: IShift) => s.shiftType === payload.shiftType,
    );
    if (shiftExists) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        `A ${payload.shiftType} shift already exists for this date. Update it instead.`,
      );
    }

    availability.shifts.push({
      _id: new Types.ObjectId(),
      shiftType: payload.shiftType,
      startTime: payload.startTime,
      endTime: payload.endTime,
      isAvailable: true,
      slots: generateSlots(payload.startTime, payload.endTime),
    });

    await availability.save();
    return availability;
  }

  availability = await Availability.create({
    caregiver: new Types.ObjectId(caregiverId),
    date: utcDate,
    shifts: [
      {
        _id: new Types.ObjectId(),
        shiftType: payload.shiftType,
        startTime: payload.startTime,
        endTime: payload.endTime,
        isAvailable: true,
        slots: generateSlots(payload.startTime, payload.endTime),
      },
    ],
    isDayBlocked: false,
  });

  return availability;
};

const getMyAvailability = async (
  caregiverId: string,
  query: { startDate?: string; endDate?: string },
) => {
  const filter: Record<string, any> = {
    caregiver: new Types.ObjectId(caregiverId),
  };

  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = toUTCMidnight(query.startDate);
    if (query.endDate) filter.date.$lte = toUTCMidnight(query.endDate);
  }

  return Availability.find(filter).sort({ date: 1 }).lean();
};

const updateShift = async (
  caregiverId: string,
  availabilityId: string,
  shiftId: string,
  body: { startTime?: string; endTime?: string; isAvailable?: boolean },
) => {
  const availability = await Availability.findOne({
    _id: new Types.ObjectId(availabilityId),
    caregiver: new Types.ObjectId(caregiverId),
  });

  if (!availability) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Availability record not found');
  }

  if (availability.isDayBlocked) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This date is blocked due to a confirmed booking. Shifts cannot be modified.',
    );
  }

  const shift = availability.shifts.find((s) => s._id.toString() === shiftId);
  if (!shift) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Shift not found');
  }

  if (body.startTime || body.endTime) {
    const hasActiveSlot = shift.slots.some(
      (s: ISlot) => s.status === 'HELD' || s.status === 'BOOKED',
    );
    if (hasActiveSlot) {
      throw new ApiError(
        StatusCodes.CONFLICT,
        'Cannot change shift times — one or more slots are currently held or booked.',
      );
    }
  }

  if (body.startTime) shift.startTime = body.startTime;
  if (body.endTime) shift.endTime = body.endTime;
  if (typeof body.isAvailable === 'boolean') shift.isAvailable = body.isAvailable;

  if (body.startTime || body.endTime) {
    shift.slots = generateSlots(shift.startTime, shift.endTime);
  }

  await availability.save();
  return availability;
};

const removeShift = async (
  caregiverId: string,
  availabilityId: string,
  shiftId: string,
) => {
  const availability = await Availability.findOne({
    _id: new Types.ObjectId(availabilityId),
    caregiver: new Types.ObjectId(caregiverId),
  });

  if (!availability) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Availability record not found');
  }

  if (availability.isDayBlocked) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This date is blocked due to a confirmed booking. Shifts cannot be removed.',
    );
  }

  const shift = availability.shifts.find((s) => s._id.toString() === shiftId);
  if (!shift) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Shift not found');
  }

  const hasActiveSlot = shift.slots.some(
    (s: ISlot) => s.status === 'HELD' || s.status === 'BOOKED',
  );
  if (hasActiveSlot) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Cannot remove shift — one or more slots are currently held or booked.',
    );
  }

  (availability.shifts as any).pull({ _id: new Types.ObjectId(shiftId) });
  await availability.save();

  return { removed: true, shiftId };
};

const deleteAvailability = async (caregiverId: string, availabilityId: string) => {
  const availability = await Availability.findOne({
    _id: new Types.ObjectId(availabilityId),
    caregiver: new Types.ObjectId(caregiverId),
  });

  if (!availability) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'Availability record not found');
  }

  if (availability.isDayBlocked) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'This date is blocked due to a confirmed booking and cannot be deleted.',
    );
  }

  const hasAnyActiveSlot = availability.shifts.some((shift) =>
    shift.slots.some((s: ISlot) => s.status === 'HELD' || s.status === 'BOOKED'),
  );
  if (hasAnyActiveSlot) {
    throw new ApiError(
      StatusCodes.CONFLICT,
      'Cannot delete — one or more slots across shifts are held or booked.',
    );
  }

  await Availability.deleteOne({ _id: availability._id });
  return { deleted: true };
};

const getCaregiverAvailability = async (
  caregiverId: string,
  query: { startDate?: string; endDate?: string },
) => {
  const filter: Record<string, any> = {
    caregiver: new Types.ObjectId(caregiverId),
    isDayBlocked: false,
  };

  if (query.startDate || query.endDate) {
    filter.date = {};
    if (query.startDate) filter.date.$gte = toUTCMidnight(query.startDate);
    if (query.endDate) filter.date.$lte = toUTCMidnight(query.endDate);
  }

  const records = await Availability.find(filter)
    .select(
      'date shifts.shiftType shifts.startTime shifts.endTime shifts.isAvailable shifts.slots.startTime shifts.slots.status',
    )
    .sort({ date: 1 })
    .lean();

  return records
    .map((record) => ({
      ...record,
      shifts: record.shifts
        .filter((s) => s.isAvailable)
        .map((s) => ({
          ...s,
          slots: s.slots.filter((slot: ISlot) => slot.status === 'AVAILABLE'),
        }))
        .filter((s) => s.slots.length > 0),
    }))
    .filter((record) => record.shifts.length > 0);
};

const holdSlot = async (
  caregiverId: string,
  date: Date,
  shiftType: string,
  slotStartTime: string,
  bookingId: Types.ObjectId,
  heldUntil: Date,
) => {
  const availability = await Availability.findOne({
    caregiver: new Types.ObjectId(caregiverId),
    date,
  });

  if (!availability) {
    throw new ApiError(StatusCodes.NOT_FOUND, 'No availability found for this date');
  }

  const shift = availability.shifts.find((s) => s.shiftType === shiftType);
  if (!shift || !shift.isAvailable) {
    throw new ApiError(StatusCodes.CONFLICT, 'Shift is not available');
  }

  const slot = shift.slots.find(
    (s: ISlot) => s.startTime === slotStartTime && s.status === 'AVAILABLE',
  );
  if (!slot) {
    throw new ApiError(StatusCodes.CONFLICT, 'Slot is not available');
  }

  slot.status = 'HELD';
  slot.heldUntil = new Date(heldUntil.toISOString()); // always store UTC
  slot.bookingId = bookingId;

  await availability.save();
  return availability;
};

const confirmSlot = async (
  caregiverId: string,
  date: Date,
  shiftType: string,
  slotStartTime: string,
  bookingId: Types.ObjectId,
) => {
  const availability = await Availability.findOne({
    caregiver: new Types.ObjectId(caregiverId),
    date,
  });
  if (!availability) return;

  const shift = availability.shifts.find((s) => s.shiftType === shiftType);
  if (!shift) return;

  const slot = shift.slots.find(
    (s: ISlot) =>
      s.startTime === slotStartTime &&
      s.bookingId?.toString() === bookingId.toString(),
  );
  if (!slot) return;

  slot.status = 'BOOKED';
  slot.heldUntil = null;
  availability.isDayBlocked = true;

  await availability.save();
};

const releaseSlot = async (
  caregiverId: string,
  date: Date,
  shiftType: string,
  slotStartTime: string,
  bookingId: Types.ObjectId,
) => {
  const availability = await Availability.findOne({
    caregiver: new Types.ObjectId(caregiverId),
    date,
  });
  if (!availability) return;

  const shift = availability.shifts.find((s) => s.shiftType === shiftType);
  if (!shift) return;

  const slot = shift.slots.find(
    (s: ISlot) =>
      s.startTime === slotStartTime &&
      s.bookingId?.toString() === bookingId.toString(),
  );
  if (!slot) return;

  slot.status = 'AVAILABLE';
  slot.heldUntil = null;
  slot.bookingId = null;

  const anyBooked = availability.shifts.some((sh) =>
    sh.slots.some((s: ISlot) => s.status === 'BOOKED'),
  );
  if (!anyBooked) {
    availability.isDayBlocked = false;
  }

  await availability.save();
};

export const AvailabilityService = {
  addShift,
  getMyAvailability,
  updateShift,
  removeShift,
  deleteAvailability,
  getCaregiverAvailability,
  holdSlot,
  confirmSlot,
  releaseSlot,
};