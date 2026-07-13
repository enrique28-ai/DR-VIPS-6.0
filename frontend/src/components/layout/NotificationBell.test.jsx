import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";
import toast from "react-hot-toast";
import NotificationBell from "./NotificationBell.jsx";
import {
  useMarkAllNotifsRead,
  useMarkNotifRead,
  useNotifications,
} from "../../features/notifications/nhooks.js";

const languageState = vi.hoisted(() => ({ language: "en" }));

vi.mock("react-hot-toast", () => ({
  default: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: languageState,
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

const getBellButton = () =>
  screen.getByRole("button", { name: "Notifications" });

const openPanel = () => {
  fireEvent.click(getBellButton());
  return screen.getByRole("dialog", { name: "Notifications" });
};

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    languageState.language = "en";
    useMarkNotifRead.mockReturnValue({ mutate: markOneMutate });
    useMarkAllNotifsRead.mockReturnValue({ mutate: markAllMutate });
    mockNotifications({ items: [], unreadCount: 0 });
  });

  test("renders a translated Bell button with disclosure ARIA closed", () => {
    render(<NotificationBell />);

    const bell = getBellButton();
    expect(bell).toBeInTheDocument();
    expect(bell).toHaveAttribute("type", "button");
    expect(bell).toHaveAttribute("aria-haspopup", "dialog");
    expect(bell).toHaveAttribute("aria-expanded", "false");
    expect(bell).toHaveAttribute("aria-controls", "notification-panel");
  });

  test("clicking Bell opens the panel and sets aria-expanded true", () => {
    render(<NotificationBell />);

    const panel = openPanel();

    expect(panel).toBeInTheDocument();
    expect(getBellButton()).toHaveAttribute("aria-expanded", "true");
  });

  test("clicking Bell again closes the panel", () => {
    render(<NotificationBell />);

    openPanel();
    fireEvent.click(getBellButton());

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getBellButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("panel has dialog semantics and a visible accessible heading", () => {
    render(<NotificationBell />);

    const panel = openPanel();
    const heading = screen.getByRole("heading", { name: "Notifications" });

    expect(panel).toHaveAttribute("id", "notification-panel");
    expect(panel).toHaveAttribute("aria-modal", "false");
    expect(panel).toHaveAttribute(
      "aria-labelledby",
      "notification-panel-title",
    );
    expect(heading).toHaveAttribute("id", "notification-panel-title");
  });

  test("panel uses viewport-safe mobile positioning and desktop width classes", () => {
    render(<NotificationBell />);

    const panel = openPanel();
    expect(panel).toHaveClass(
      "fixed",
      "left-3",
      "right-3",
      "top-16",
      "max-h-[calc(100dvh-5rem)]",
      "sm:absolute",
      "sm:w-96",
    );
    expect(panel.querySelector(".overflow-y-auto")).toHaveClass(
      "min-h-0",
      "overflow-x-hidden",
      "overflow-y-auto",
    );
  });

  test("clicking outside closes the panel", () => {
    render(<NotificationBell />);
    openPanel();

    fireEvent.click(document.body);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getBellButton()).toHaveAttribute("aria-expanded", "false");
  });

  test("clicking inside the panel does not close it", () => {
    render(<NotificationBell />);
    const panel = openPanel();

    fireEvent.click(panel);

    expect(panel).toBeInTheDocument();
    expect(getBellButton()).toHaveAttribute("aria-expanded", "true");
  });

  test("Escape closes the panel and returns focus to Bell", () => {
    mockNotifications({ items: [notification()], unreadCount: 1 });
    render(<NotificationBell />);
    openPanel();
    const markAllButton = screen.getByRole("button", {
      name: "Mark all as read",
    });
    markAllButton.focus();

    fireEvent.keyDown(window, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(getBellButton()).toHaveAttribute("aria-expanded", "false");
    expect(getBellButton()).toHaveFocus();
  });

  test("removes outside-click and Escape listeners on unmount", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<NotificationBell />);
    openPanel();

    unmount();

    expect(removeListener).toHaveBeenCalledWith("click", expect.any(Function));
    expect(removeListener).toHaveBeenCalledWith(
      "keydown",
      expect.any(Function),
    );
  });

  test("opens panel and shows empty state with no mark-all action", () => {
    render(<NotificationBell />);

    openPanel();

    expect(screen.getByText("No notifications.")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
  });

  test("renders notification title and message from English localized fields", () => {
    mockNotifications({ items: [notification()], unreadCount: 1 });

    render(<NotificationBell />);
    openPanel();

    expect(screen.getByText("Appointment update")).toBeInTheDocument();
    expect(screen.getByText("Your appointment changed.")).toBeInTheDocument();
  });

  test("uses the selected language and falls back to English fields", () => {
    languageState.language = "es-MX";
    mockNotifications({
      items: [
        notification({
          title: { en: "English title", es: "Titulo en espanol" },
          message: { en: "English fallback message" },
        }),
      ],
      unreadCount: 1,
    });

    render(<NotificationBell />);
    openPanel();

    expect(screen.getByText("Titulo en espanol")).toBeInTheDocument();
    expect(screen.getByText("English fallback message")).toBeInTheDocument();
  });

  test("unread notification is a semantic button and marks only that id without closing", () => {
    mockNotifications({ items: [notification()], unreadCount: 1 });
    render(<NotificationBell />);
    openPanel();
    const itemButton = screen.getByText("Appointment update").closest("button");

    expect(itemButton).not.toBeNull();
    expect(itemButton).toHaveAttribute("type", "button");
    expect(itemButton).toHaveClass("w-full", "break-words", "text-left");
    fireEvent.click(itemButton);

    expect(markOneMutate).toHaveBeenCalledWith("notification-1");
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  test("read notification button does not call markOne", () => {
    mockNotifications({
      items: [notification({ isRead: true })],
      unreadCount: 0,
    });
    render(<NotificationBell />);
    openPanel();

    fireEvent.click(screen.getByText("Appointment update").closest("button"));

    expect(markOneMutate).not.toHaveBeenCalled();
  });

  test("mark-all appears for unread notifications, mutates once, and keeps panel open", () => {
    mockNotifications({ items: [notification()], unreadCount: 1 });
    render(<NotificationBell />);
    openPanel();

    fireEvent.click(
      screen.getByRole("button", { name: "Mark all as read" }),
    );

    expect(markAllMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
  });

  test("mark-all is absent when unread count is zero", () => {
    mockNotifications({
      items: [notification({ isRead: true })],
      unreadCount: 0,
    });
    render(<NotificationBell />);
    openPanel();

    expect(
      screen.queryByRole("button", { name: "Mark all as read" }),
    ).not.toBeInTheDocument();
  });

  test("renders unread count badge when unread notifications exist", () => {
    mockNotifications({ items: [notification()], unreadCount: 3 });

    render(<NotificationBell />);

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  test("renders no unread badge when unread count is zero", () => {
    render(<NotificationBell />);

    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  test("does not toast for notifications already present on first render", () => {
    mockNotifications({ items: [notification()], unreadCount: 1 });

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
      expect(toast).toHaveBeenCalledWith("A new notification arrived.", {
        duration: 4500,
      });
    });
  });
});
