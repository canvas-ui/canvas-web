// The empty desk — what you get when every content section is closed. It
// deliberately renders nothing but the surface itself: the shell's menus and
// toolbox stay usable, and this is where a dynamic background will live.
export default function DeskPage() {
  return <div className="h-full w-full" aria-hidden />
}
