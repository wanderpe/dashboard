import Image from "next/image";

export function CartmanAvatar({ className }: { className?: string }) {
  return (
    <Image
      src="/eric-cartman.webp"
      width={480}
      height={480}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={className}
    />
  );
}
