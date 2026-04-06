export const validateBooking = (req, res, next) => {
    const { customerId, workerId, serviceType, date, time } = req.body;
    if (!customerId || !workerId || !serviceType || !date || !time) {
        return res.status(400).json({ error: "Missing required booking fields" });
    }
    
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: "Invalid date format. Expected YYYY-MM-DD." });
    }
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: "Invalid time format. Expected HH:MM." });
    }

    next();
};

export const validateStatusUpdate = (req, res, next) => {
    const { status, rejectionReason } = req.body;
    const allowedStatuses = ['accepted', 'rejected', 'completed', 'cancelled'];
    
    if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${allowedStatuses.join(', ')}` });
    }
    
    if (status === 'rejected' && (!rejectionReason || !rejectionReason.trim())) {
        return res.status(400).json({ error: "A rejection reason is strictly required when declining a request." });
    }
    
    next();
};

export const validateFeedback = (req, res, next) => {
    const { rating, comment } = req.body;
    if (rating === undefined || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ error: "Rating must be a number between 1 and 5." });
    }
    if (!comment || typeof comment !== 'string' || comment.trim().length < 5) {
        return res.status(400).json({ error: "A valid feedback comment (at least 5 characters) is required." });
    }
    next();
};
