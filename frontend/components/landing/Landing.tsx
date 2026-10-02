// Logged-out home page. Server component: all text, numbers, images and rows
// are in the HTML returned for "/". Shown only to guests via the .guest-only
// CSS gate (see globals.css + the boot script in app/layout.tsx).
// Copy and layout follow the owner-approved mockup.

import Link from "next/link";

import { MileageChart } from "@/components/MileageChart";
import { TrackedLink } from "@/components/TrackedLink";
import { eventTypeBadge, eventTypeLabel } from "@/lib/events";
import { formatDate, formatMoney } from "@/lib/format";
import type { LandingCar, LandingData, LandingHeroPair } from "@/lib/landing";

const APP_STORE_URL = "https://apps.apple.com/us/app/carfable/id6804418892";

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
const numberWord = (n: number) => NUMBER_WORDS[n] ?? String(n);
const miles = (n: number) => `${n.toLocaleString("en-US")} mi`;
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const wholeDollars = (cents: number) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function CtaButtons({ location }: { location: "hero" | "footer" }) {
  return (
    <div className="lp-cta">
      <TrackedLink href="/auth" event="cta_signup_click" params={{ location }} className="lp-btn lp-btn-primary lp-btn-lg">
        Sign up free
      </TrackedLink>
      <TrackedLink href={APP_STORE_URL} event="cta_appstore_click" params={{ location }} className="lp-btn lp-btn-secondary lp-btn-lg">
        Get the iPhone app
      </TrackedLink>
    </div>
  );
}

function Badge({ type }: { type: string }) {
  return <span className={`lp-badge ${eventTypeBadge(type)}`}>{eventTypeLabel(type)}</span>;
}

function HeroProof({ hero }: { hero: LandingHeroPair }) {
  const receiptYear = hero.date ? hero.date.slice(0, 4) + " " : "";
  const alt = `A ${receiptYear}${hero.shop ? `${hero.shop} ` : ""}receipt for ${hero.title.toLowerCase()}, with the customer's personal details blurred`;
  return (
    <div className="lp-proof" role="group" aria-label="A real receipt and the record CarFable made from it">
      <div className="lp-receipt" style={{ aspectRatio: `${hero.imageWidth} / ${hero.imageHeight}` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={hero.imageUrl} alt={alt} width={hero.imageWidth} height={hero.imageHeight} fetchPriority="high" />
      </div>
      <div className="lp-record">
        <div className="lp-record-top">
          <div>
            <Badge type={hero.eventType} />
            <p className="lp-record-title">{hero.title}</p>
          </div>
          {hero.costCents != null && hero.costCents > 0 && <p className="lp-record-cost">{formatMoney(hero.costCents)}</p>}
        </div>
        <dl className="lp-kv">
          {hero.date && (
            <>
              <dt>Date</dt>
              <dd>{formatDate(hero.date)}</dd>
            </>
          )}
          {hero.mileage != null && (
            <>
              <dt>Mileage</dt>
              <dd>{miles(hero.mileage)}</dd>
            </>
          )}
          {hero.shop && (
            <>
              <dt>Shop</dt>
              <dd>{hero.shop}</dd>
            </>
          )}
        </dl>
        <p className="lp-read">
          {hero.fromReceipt ? "Read from the receipt above. " : ""}
          Personal details are blurred before anyone else can see it.
        </p>
      </div>
    </div>
  );
}

function CarSection({ car }: { car: LandingCar }) {
  const multipleOwners = car.owners != null && car.owners > 1;
  const since = car.firstYear != null ? `every receipt since ${car.firstYear}` : "every receipt";
  const subLead =
    car.owners != null
      ? `${numberWord(car.owners)} ${plural(car.owners, "owner", "owners")}, and ${since}.`
      : `${since.charAt(0).toUpperCase()}${since.slice(1)}.`;
  const chartFirst = car.chartPoints[0];
  const chartLast = car.chartPoints[car.chartPoints.length - 1];
  const showChart = car.chartPoints.length >= 2;

  return (
    <section className="lp-car" aria-labelledby="lp-car-heading">
      <div className="lp-wrap">
        <p className="lp-eyebrow">A real history</p>
        <h2 id="lp-car-heading" className="lp-h2">
          {car.label}
        </h2>
        <p className="lp-sub">
          {subLead}
          {multipleOwners && " The first owner's paperwork came with the truck and went into the same timeline."}
        </p>

        <div className="lp-car-grid">
          {car.coverUrl && (
            <div className={`lp-photo${showChart ? "" : " lp-span2"}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={car.coverUrl} alt={`The ${car.label} whose history is shown here`} width={1100} height={825} loading="lazy" />
            </div>
          )}
          {showChart && (
            <div className={`lp-panel lp-panel-chart${car.coverUrl ? "" : " lp-span2"}`}>
              <p className="lp-chart-cap">Odometer, from the receipts</p>
              <MileageChart
                bare
                points={car.chartPoints}
                boundaries={car.chartBoundary ? [car.chartBoundary] : undefined}
                ariaLabel={`Odometer readings from ${miles(chartFirst.miles)} in ${chartFirst.date.slice(0, 4)} to ${miles(chartLast.miles)} in ${chartLast.date.slice(0, 4)}`}
              />
            </div>
          )}

          <div className="lp-panel lp-span2">
            <div className="lp-stats">
              {car.years != null && (
                <div className="lp-stat">
                  <b>
                    {car.years} {plural(car.years, "year", "years")}
                  </b>
                  <span>of records</span>
                </div>
              )}
              {car.owners != null && (
                <div className="lp-stat">
                  <b>{car.owners}</b>
                  <span>{plural(car.owners, "owner", "owners")}</span>
                </div>
              )}
              <div className="lp-stat">
                <b>{car.receipts}</b>
                <span>{plural(car.receipts, "receipt on file", "receipts on file")}</span>
              </div>
              <div className="lp-stat">
                <b>{wholeDollars(car.totalCents)}</b>
                <span>{car.milesSpan != null ? `spent over ${car.milesSpan.toLocaleString("en-US")} miles` : "spent"}</span>
              </div>
            </div>
          </div>

          {car.rows.length > 0 && (
            <div className="lp-panel lp-span2">
              <ul>
                {car.rows.map((row) => (
                  <li key={row.id} className="lp-ev">
                    <div className="lp-ev-main">
                      <p className="lp-ev-meta">
                        <Badge type={row.eventType} />
                        {row.date && <span>{formatDate(row.date)}</span>}
                        {row.mileage != null && <span>{miles(row.mileage)}</span>}
                      </p>
                      <p className="lp-ev-title">{row.title}</p>
                      {(row.fromReceipt || row.previousOwner || row.receiptCount > 0) && (
                        <p className="lp-ev-chips">
                          {row.fromReceipt && <span className="lp-chip lp-chip-src">From receipt</span>}
                          {row.previousOwner && <span className="lp-chip">Previous owner</span>}
                          {row.receiptCount > 0 && (
                            <span className="lp-chip">
                              {row.receiptCount} {plural(row.receiptCount, "receipt", "receipts")}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {row.costCents != null && row.costCents > 0 && <p className="lp-ev-cost">{formatMoney(row.costCents)}</p>}
                  </li>
                ))}
              </ul>
              <TrackedLink href={`/v/${car.id}?tab=history`} event="landing_example_click" className="lp-more">
                See all {car.recordCount} records
              </TrackedLink>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function Landing({ data }: { data: LandingData }) {
  return (
    <div className="landing">
      <header className="lp-wrap lp-nav">
        <Link className="lp-brand" href="/">
          <span className="lp-logo">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" width={36} height={36} />
          </span>
          CarFable
        </Link>
        <nav className="lp-nav-links" aria-label="Account">
          <Link href="/auth" className="lp-btn lp-btn-ghost">
            Log in
          </Link>
          <TrackedLink href="/auth" event="cta_signup_click" params={{ location: "nav" }} className="lp-btn lp-btn-primary">
            Sign up
          </TrackedLink>
        </nav>
      </header>

      <section className={`lp-wrap lp-hero${data.hero ? " lp-hero-split" : ""}`}>
        <div>
          <h1 className="lp-h1">Your car&rsquo;s service history, kept in one place.</h1>
          <p className="lp-lede">
            Take a photo of a receipt. CarFable reads the date, cost, shop and mileage and adds it to your car&apos;s
            timeline. Keep the record while you own the car, then hand it to the next owner.
          </p>
          <CtaButtons location="hero" />
          <p className="lp-fine">Free. Works on the web and on iPhone.</p>
        </div>
        {data.hero && <HeroProof hero={data.hero} />}
      </section>

      {data.car && <CarSection car={data.car} />}

      <section className="lp-wrap lp-facts" aria-label="How CarFable treats your records">
        <div className="lp-fact">
          <h3>Receipts stay private</h3>
          <p>
            A receipt carries your name, address and phone number. CarFable finds those and blurs them. You choose
            whether anyone sees a receipt at all.
          </p>
        </div>
        <div className="lp-fact">
          <h3>The history follows the car</h3>
          <p>
            When you sell, transfer the record to the buyer. They get every entry you made, and yours can no longer be
            edited.
          </p>
        </div>
        <div className="lp-fact">
          <h3>Your records are yours</h3>
          <p>Export the whole history as a spreadsheet with all the photos, any time.</p>
        </div>
      </section>

      <section className="lp-close">
        <div className="lp-wrap lp-close-in">
          <div>
            <h2 className="lp-h2">Start your car&apos;s history</h2>
            <p className="lp-sub">Your first receipt takes about a minute.</p>
          </div>
          <CtaButtons location="footer" />
        </div>
      </section>

      <footer className="lp-wrap lp-foot">
        <span>CarFable</span>
        <span className="lp-foot-links">
          <Link href="/privacy">Privacy</Link>
          <Link href="/support">Support</Link>
        </span>
      </footer>
    </div>
  );
}
