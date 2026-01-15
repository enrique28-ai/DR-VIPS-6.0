import Notification from "../models/Notification.js";

export const getMyNotifications = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit || "30", 10), 100);
    const unreadOnly = req.query.unread === "1";

    const filter = { recipient: req.user._id };
    if (unreadOnly) filter.isRead = false;

    const [items, unreadCount] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean(),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    return res.json({ items, unreadCount });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};

export const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const r = await Notification.updateOne(
      { _id: id, recipient: req.user._id },
      { $set: { isRead: true } }
    );

    if (r.matchedCount === 0) {
      return res.status(404).json({ error: "Notification not found" });
    }

    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};

export const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
};
