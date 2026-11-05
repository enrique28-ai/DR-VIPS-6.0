import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import Input from "./Input.jsx";

const IconStub = (props) => <svg data-testid="icon-stub" {...props} />;

const renderInput = (props = {}) => render(<Input {...props} />);

describe("Input", () => {
  test("renders an input by default", () => {
    renderInput();
    expect(screen.getByRole("textbox")).toBeInTheDocument();
  });

  test("forwards standard props to the underlying input", () => {
    renderInput({
      type: "email",
      name: "email",
      placeholder: "you@example.com",
      defaultValue: "hi",
      required: true,
    });

    const input = screen.getByRole("textbox");
    expect(input).toHaveAttribute("type", "email");
    expect(input).toHaveAttribute("name", "email");
    expect(input).toHaveAttribute("placeholder", "you@example.com");
    expect(input).toHaveValue("hi");
    expect(input).toBeRequired();
  });

  test("supports controlled value with onChange", () => {
    const onChange = vi.fn();
    renderInput({ value: "x", onChange });

    const input = screen.getByRole("textbox");
    expect(input).toHaveValue("x");
  });

  test("calls onChange when the value changes", () => {
    const onChange = vi.fn();
    renderInput({ onChange });

    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hello" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("hello");
  });

  test("renders label text when label is provided", () => {
    renderInput({ label: "Email" });

    expect(screen.getByText("Email")).toBeInTheDocument();
  });

  test("links label to input when id or name is available", () => {
    renderInput({ id: "patient-email", label: "Email" });

    expect(screen.getByLabelText("Email")).toHaveAttribute("id", "patient-email");
  });

  test("uses name as a fallback id for label association", () => {
    renderInput({ name: "phone", label: "Phone" });

    expect(screen.getByLabelText("Phone")).toHaveAttribute("id", "phone");
  });

  test("does not render the label text when label is omitted", () => {
    renderInput();

    expect(screen.queryByText("Email")).not.toBeInTheDocument();
  });

  test("renders the icon when icon prop is provided", () => {
    renderInput({ icon: IconStub });

    expect(screen.getByTestId("icon-stub")).toBeInTheDocument();
  });

  test("does not render the icon when icon prop is omitted", () => {
    renderInput();

    expect(screen.queryByTestId("icon-stub")).not.toBeInTheDocument();
  });

  test("forwards custom className to the input", () => {
    renderInput({ className: "extra-class" });

    const input = screen.getByRole("textbox");
    expect(input.className).toContain("extra-class");
  });

  test("supports custom container className without dropping input props", () => {
    const { container } = renderInput({
      containerClassName: "mb-0",
      placeholder: "Search",
    });

    expect(container.firstChild).toHaveClass("mb-0");
    expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
  });

  test("forwards disabled and required props", () => {
    renderInput({ disabled: true, required: true });

    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    expect(input).toBeRequired();
  });
});
