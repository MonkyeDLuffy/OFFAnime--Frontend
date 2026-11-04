/**
 * /search loading state — five glass skeleton rows pulsing like the app's
 * other skeletons (motion-safe), no content flash while the server fetch
 * resolves.
 */
export default function SearchLoading() {
  return (
    <main className="pb-24">
      <div className="mx-auto w-full max-w-[720px] px-5 pt-28 sm:px-8 sm:pt-32">
        <h1 className="type-display text-[30px] sm:text-36px lg:text-40px">Search</h1>
        <div className="mt-4 h-[38px] w-[150px] rounded-full bg-white/[0.06] motion-safe:animate-pulse" />
        <div className="mt-4 min-h-[240px] rounded-2xl border border-white/10 bg-white/[0.02] px-1.5 py-2 sm:px-2.5">
          <ul className="search-rows" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((index) => (
              <li key={index} className="search-row relative">
                <span className="aspect-[2/3] w-[56px] shrink-0 rounded-lg bg-white/[0.06] motion-safe:animate-pulse" />
                <span className="min-w-0 flex-1">
                  <span className="block h-[17px] w-1/2 rounded bg-white/[0.07] motion-safe:animate-pulse" />
                  <span className="mt-2 block h-[11px] w-1/4 rounded bg-white/[0.05] motion-safe:animate-pulse" />
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
