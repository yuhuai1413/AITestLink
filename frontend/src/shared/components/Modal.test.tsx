import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

// Mock lucide-react
vi.mock("lucide-react", () => ({
  X: (props: any) => <svg data-testid="x-icon" {...props} />,
}));

describe("Modal", () => {
  it("renders title", () => {
    render(
      <Modal open={true} onClose={() => {}} title="测试弹窗">
        <p>内容</p>
      </Modal>,
    );
    expect(screen.getByText("测试弹窗")).toBeInTheDocument();
  });

  it("renders children", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Title">
        <p>弹窗内容</p>
      </Modal>,
    );
    expect(screen.getByText("弹窗内容")).toBeInTheDocument();
  });

  it("renders close button", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Title">
        <p>Content</p>
      </Modal>,
    );
    expect(screen.getByTitle("关闭")).toBeInTheDocument();
  });

  it("calls onClose when close button clicked", async () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Title">
        <p>Content</p>
      </Modal>,
    );
    fireEvent.click(screen.getByTitle("关闭"));
    expect(onClose).toHaveBeenCalled();
  });

  it("calls onClose when the overlay click starts on the overlay", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Title">
        <p>Content</p>
      </Modal>,
    );
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when a drag starts inside the dialog and ends on the overlay", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Title">
        <input aria-label="Name" defaultValue="Content" />
      </Modal>,
    );
    const input = screen.getByLabelText("Name");
    const overlay = document.querySelector(".modal-overlay") as HTMLElement;
    fireEvent.mouseDown(input);
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("applies custom width", () => {
    render(
      <Modal open={true} onClose={() => {}} title="Title" width={700}>
        <p>Content</p>
      </Modal>,
    );
    const dialog = document.querySelector(".modal-dialog");
    expect(dialog).toHaveStyle({ width: "700px" });
  });

  it("does not render dialog when closed", () => {
    render(
      <Modal open={false} onClose={() => {}} title="Title">
        <p>Content</p>
      </Modal>,
    );
    expect(document.querySelector(".modal-dialog")).not.toBeInTheDocument();
  });
});
