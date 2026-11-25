/**
 * Loading skeletons (the route `loading.tsx` files and client pages while
 * their data loads). Each mirrors the real page's layout at the same sizes,
 * so nothing jumps when content arrives. Theme colours only (`muted` blocks on
 * the page background); the pulse is skipped for people who ask for reduced
 * motion. No text, so they need no translation; the wrapper is announced as
 * busy to screen readers.
 */

function Bone({ className = "" }: { className?: string }) {
  return <div className={`rounded-theme bg-muted motion-safe:animate-pulse ${className}`} />;
}

function Busy({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      {children}
    </div>
  );
}

/** One product card: 3:4 photo, two title lines, price. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Bone className="aspect-[3/4] w-full" />
      <div className="flex flex-col gap-1.5">
        <Bone className="h-3.5 w-11/12" />
        <Bone className="h-3.5 w-2/3" />
      </div>
      <Bone className="h-4 w-1/3" />
    </div>
  );
}

function CardGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Home and CMS pages: a hero band, a section heading and a row of products. */
export function PageSkeleton() {
  return (
    <Busy>
      <Bone className="h-[460px] w-full rounded-none sm:h-[560px] lg:h-[640px]" />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 px-4 py-12 sm:px-8 sm:py-20">
        <Bone className="h-8 w-56" />
        <div className="w-full">
          <CardGrid />
        </div>
      </div>
    </Busy>
  );
}

/** `/shop`, categories, collections and search: heading, search box, filter / sort bar, count and a product grid. */
export function ListingSkeleton({ searchBox = false }: { searchBox?: boolean }) {
  return (
    <Busy className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-8">
      <Bone className="h-8 w-44 sm:h-9" />
      <div className="mt-5 flex flex-col gap-5">
        {searchBox && <Bone className="h-12 w-full" />}
        <div className="flex gap-8">
          <div className="hidden w-60 shrink-0 flex-col gap-4 lg:flex">
            {Array.from({ length: 6 }, (_, i) => (
              <Bone key={i} className="h-5 w-full" />
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex gap-2">
              <Bone className="h-11 w-28 lg:hidden" />
              <Bone className="h-11 flex-1 sm:w-48 sm:flex-none" />
            </div>
            <div className="flex items-center justify-between">
              <Bone className="h-4 w-24" />
              <Bone className="h-10 w-32" />
            </div>
            <CardGrid count={6} />
          </div>
        </div>
      </div>
    </Busy>
  );
}

/** Product page: gallery, title, price, options, buttons. */
export function ProductSkeleton() {
  return (
    <Busy className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
      <Bone className="mb-4 h-3 w-40" />
      <div className="grid gap-8 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <Bone className="aspect-square w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} className="h-16 w-16" />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Bone className="h-8 w-11/12" />
          <Bone className="h-4 w-28" />
          <Bone className="h-7 w-32" />
          <Bone className="h-4 w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Bone key={i} className="h-9 w-9 rounded-full" />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Bone key={i} className="h-10 w-14" />
            ))}
          </div>
          <div className="flex gap-2">
            <Bone className="h-12 flex-1" />
            <Bone className="h-12 flex-1" />
          </div>
        </div>
      </div>
    </Busy>
  );
}

/** Cart: item rows and the totals box. */
export function CartSkeleton() {
  return (
    <Busy className="mx-auto max-w-3xl px-4 py-10">
      <Bone className="mb-6 h-8 w-32" />
      <div className="flex flex-col gap-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="flex gap-4 border-b border-border pb-4">
            <Bone className="aspect-[3/4] w-20 shrink-0" />
            <div className="flex flex-1 flex-col gap-2 py-1">
              <Bone className="h-4 w-4/5" />
              <Bone className="h-4 w-1/3" />
              <Bone className="mt-auto h-9 w-28" />
            </div>
          </div>
        ))}
        <div className="flex flex-col gap-3 rounded-theme border border-border p-4">
          <Bone className="h-4 w-full" />
          <Bone className="h-4 w-full" />
          <Bone className="h-6 w-2/3" />
          <Bone className="mt-2 h-12 w-full" />
        </div>
      </div>
    </Busy>
  );
}

/** Account and other text pages: heading and a few rows. */
export function AccountSkeleton() {
  return (
    <Busy className="mx-auto max-w-3xl px-4 py-10">
      <Bone className="mb-6 h-8 w-40" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Bone key={i} className="h-16 w-full" />
        ))}
      </div>
    </Busy>
  );
}
