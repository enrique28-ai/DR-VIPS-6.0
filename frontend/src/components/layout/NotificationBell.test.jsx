import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import toast from "react-hot-toast";
import NotificationBell from "./NotificationBell.jsx";
import {
  useMarkAllNotifsRead,
  useMarkNotifRead,
  useNotifications,
} from "../../features/notifications/nhooks.js";

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: "en" },
    t: (key, fallback) => fallback ?? key,
  }),
}));

vi.mock("../../features/notifications/nhooks.js", () => ({
  useNotifications: vi.fn(),
  useMarkNotifRead: vi.fn(),
  useMarkAllNotifsRead: vi.fn(),
}));

const markOneMutate = vi.fn();
const markAllMutate = vi.fn();

const notification = (overrides = {}) => ({
  _id: "notification-1",
  title: {
    en: "Appointment update",
    es: "Actualizacion de cita",
  },
  message: {
    en: "Your appointment changed.",
    es: "Tu cita cambio.",
  },
  isRead: false,
  createdAt: "2026-06-23T10:00:00.000Z",
  ...overrides,
});

const mockNotifications = (data) => {
  useNotifications.mockReturnValue({ data });
};

const openDropdown = () => {
  fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useMarkNotifRead.mockReturnValue({ mutate: markOneMutate });
    useMarkAllNotifsRead.mockReturnValue({ mutate: markAllMutate });
    mockNotifications({ items: [], unreadCount: 0 });
  });

  test("renders bell button without unread badge when unread count is zero", () => {
    render(<NotificationBell />);

    expect(screen.getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  test("renders unread count badge when unread notifications exist", () => {
    mockNotifications({
      items: [notification()],
      unreadCount: 3,
    });

    render(<NotificationBell />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("opens dropdown and shows empty state when there are no notifications", () => {
    render(<NotificationBell />);

    openDropdown();

    expect(screen.getByRole("heading", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("No notifications.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark all as read" })).not.toBeInTheDocument();
  });

  test("renders notification title and message from English localized fields", () => {
    mockNotifications({
      items: [notification()],
      unreadCount: 1,
    });

    render(<NotificationBell />);
    openDropdown();

    expect(screen.getByText("Appointment update")).toBeInTheDocument();
    expect(screen.getByText("Your appointment changed.")).toBeInTheDocument();
  });

  test("marks an unread notification as read when clicked", () => {
    mockNotifications({
      items: [notification()],
      unreadCount: 1,
    });

    render(<NotificationBell />);
    openDropdown();

    fireEvent.click(screen.getByText("Appointment update").closest("div"));

    expect(markOneMutate).toHaveBeenCalledWith("notification-1");
  });

  test("does not mark an already-read notification when clicked", () => {
    mockNotifications({
      items: [notification({ isRead: true })],
      unreadCount: 0,
    });

    render(<NotificationBell />);
    openDropdown();

    fireEvent.click(screen.getByText("Appointment update").closest("div"));

    expect(markOneMutate).not.toHaveBeenCalled();
  });

  test("shows mark-all action for unread notifications and calls mutate when clicked", () => {
    mockNotifications({
      items: [notification()],
      unreadCount: 1,
    });

    render(<NotificationBell />);
    openDropdown();

    fireEvent.click(screen.getByRole("button", { name: "Mark all as read" }));

    expect(markAllMutate).toHaveBeenCalledTimes(1);
  });

  test("does not toast for notifications already present on first render", () => {
    mockNotifications({
      items: [notification()],
      unreadCount: 1,
    });

    render(<NotificationBell />);

    expect(toast).not.toHaveBeenCalled();
  });

  test("toasts when a new notification appears after the first render", async () => {
    let payload = {
      items: [notification()],
      unreadCount: 1,
    };
    useNotifications.mockImplementation(() => ({ data: payload }));

    const { rerender } = render(<NotificationBell />);

    expect(toast).not.toHaveBeenCalled();

    payload = {
      items: [
        notification({
          _id: "notification-2",
          title: { en: "New message" },
          message: { en: "A new notification arrived." },
        }),
        notification(),
      ],
      unreadCount: 2,
    };
    rerender(<NotificationBell />);

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith("A new notification arrived.", { duration: 4500 });
    });
  });
});
