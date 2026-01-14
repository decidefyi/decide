# Getting Started with Speed Insights

This guide will help you get started with using Vercel Speed Insights on your project, showing you how to enable it, add the package to your project, deploy your app to Vercel, and view your data in the dashboard.

To view instructions on using the Vercel Speed Insights in your project for your framework, use the **Choose a framework** dropdown on the right (at the bottom in mobile view).

## Prerequisites

- A Vercel account. If you don't have one, you can [sign up for free](https://vercel.com/signup).
- A Vercel project. If you don't have one, you can [create a new project](https://vercel.com/new).
- The Vercel CLI installed. If you don't have it, you can install it using the following command:

### Install Vercel CLI

```bash
# Using pnpm
pnpm i vercel
```

```bash
# Using yarn
yarn i vercel
```

```bash
# Using npm
npm i vercel
```

```bash
# Using bun
bun i vercel
```

## Setup Steps

### 1. Enable Speed Insights in Vercel

On the [Vercel dashboard](/dashboard), select your Project followed by the **Speed Insights** tab. You can also select the button below to be taken there. Then, select **Enable** from the dialog.

> **💡 Note:** Enabling Speed Insights will add new routes (scoped at `/_vercel/speed-insights/*`) after your next deployment.

### 2. Add `@vercel/speed-insights` to your project

Using the package manager of your choice, add the `@vercel/speed-insights` package to your project:

```bash
# Using pnpm
pnpm i @vercel/speed-insights
```

```bash
# Using yarn
yarn i @vercel/speed-insights
```

```bash
# Using npm
npm i @vercel/speed-insights
```

```bash
# Using bun
bun i @vercel/speed-insights
```

> **Note:** When using the HTML implementation, there is no need to install the `@vercel/speed-insights` package.

### 3. Add Speed Insights to Your Application

The implementation varies based on your framework. Choose the section below that matches your framework:

#### Next.js (Pages Router)

Add the following component to your main app file:

```typescript
// pages/_app.tsx
import type { AppProps } from 'next/app';
import { SpeedInsights } from '@vercel/speed-insights/next';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <SpeedInsights />
    </>
  );
}

export default MyApp;
```

For versions of Next.js older than 13.5, import the `<SpeedInsights>` component from `@vercel/speed-insights/react` and pass the pathname of the route:

```typescript
// pages/example-component.tsx
import { SpeedInsights } from "@vercel/speed-insights/react";
import { useRouter } from "next/router";

export default function Layout() {
  const router = useRouter();

  return <SpeedInsights route={router.pathname} />;
}
```

#### Next.js (App Router - 13.5+)

Add the following component to your root layout:

```typescript
// app/layout.tsx
import { SpeedInsights } from "@vercel/speed-insights/next";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Next.js</title>
      </head>
      <body>
        {children}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

For versions of Next.js older than 13.5, create a dedicated client component to avoid opting out from SSR:

```typescript
// app/insights.tsx
"use client";

import { SpeedInsights } from "@vercel/speed-insights/react";
import { usePathname } from "next/navigation";

export function Insights() {
  const pathname = usePathname();

  return <SpeedInsights route={pathname} />;
}
```

Then import it in your layout:

```typescript
// app/layout.tsx
import type { ReactNode } from "react";
import { Insights } from "./insights";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <title>Next.js</title>
      </head>
      <body>
        {children}
        <Insights />
      </body>
    </html>
  );
}
```

#### Create React App

Add the following component to your main app file:

```typescript
// App.tsx
import { SpeedInsights } from '@vercel/speed-insights/react';

export default function App() {
  return (
    <div>
      {/* ... */}
      <SpeedInsights />
    </div>
  );
}
```

#### Remix

Add the following component to your root file:

```typescript
// app/root.tsx
import { SpeedInsights } from '@vercel/speed-insights/remix';

export default function App() {
  return (
    <html lang="en">
      <body>
        {/* ... */}
        <SpeedInsights />
      </body>
    </html>
  );
}
```

#### SvelteKit

Add the following to your root layout file:

```typescript
// src/routes/+layout.ts
import { injectSpeedInsights } from "@vercel/speed-insights/sveltekit";

injectSpeedInsights();
```

#### Vue

Add the following component to your main app template:

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { SpeedInsights } from '@vercel/speed-insights/vue';
</script>

<template>
  <SpeedInsights />
</template>
```

#### Nuxt

Add the following component to your default layout:

```vue
<!-- layouts/default.vue -->
<script setup lang="ts">
import { SpeedInsights } from '@vercel/speed-insights/vue';
</script>

<template>
  <SpeedInsights />
</template>
```

#### Astro

Speed Insights is available for both static and SSR Astro apps. Declare the `<SpeedInsights />` component from `@vercel/speed-insights/astro` near the bottom of one of your layout components:

```astro
---
// BaseHead.astro
import SpeedInsights from '@vercel/speed-insights/astro';
const { title, description } = Astro.props;
---
<title>{title}</title>
<meta name="title" content={title} />
<meta name="description" content={description} />

<SpeedInsights />
```

Optionally, you can remove sensitive information from the URL by adding a `speedInsightsBeforeSend` function to the global `window` object:

```astro
---
// BaseHead.astro
import SpeedInsights from '@vercel/speed-insights/astro';
const { title, description } = Astro.props;
---
<title>{title}</title>
<meta name="title" content={title} />
<meta name="description" content={description} />

<script is:inline>
  function speedInsightsBeforeSend(data){
    console.log("Speed Insights before send", data)
    return data;
  }
</script>
<SpeedInsights />
```

#### Other Frameworks

Import the `injectSpeedInsights` function from the package in your main app file. This should only be called once in your app, and must run in the client:

```typescript
// main.ts
import { injectSpeedInsights } from "@vercel/speed-insights";

injectSpeedInsights();
```

#### HTML

Add the following scripts before the closing tag of the `<body>`:

```html
<!-- index.html -->
<script>
  window.si = window.si || function () { (window.siq = window.siq || []).push(arguments); };
</script>
<script defer src="/_vercel/speed-insights/script.js"></script>
```

> **Note:** When using the HTML implementation, there is no need to install the `@vercel/speed-insights` package.

### 4. Deploy Your App to Vercel

You can deploy your app to Vercel's global [CDN](/docs/cdn) by running the following command from your terminal:

```bash
vercel deploy
```

Alternatively, you can [connect your project's git repository](/docs/git#deploying-a-git-repository), which will enable Vercel to deploy your latest pushes and merges to main.

Once your app is deployed, it's ready to begin tracking performance metrics.

> **💡 Note:** If everything is set up correctly, you should be able to find the `/_vercel/speed-insights/script.js` script inside the body tag of your page.

### 5. View Your Data in the Dashboard

Once your app is deployed, and users have visited your site, you can view the data in the dashboard.

To do so, go to your [dashboard](/dashboard), select your project, and click the **Speed Insights** tab.

After a few days of visitors, you'll be able to start exploring your metrics. For more information on how to use Speed Insights, see [Using Speed Insights](/docs/speed-insights/using-speed-insights).

## Privacy and Compliance

Learn more about how Vercel supports [privacy and data compliance standards](/docs/speed-insights/privacy-policy) with Vercel Speed Insights.

## Next Steps

Now that you have Vercel Speed Insights set up, you can explore the following topics to learn more:

- [Learn how to use the `@vercel/speed-insights` package](/docs/speed-insights/package)
- [Learn about metrics](/docs/speed-insights/metrics)
- [Read about privacy and compliance](/docs/speed-insights/privacy-policy)
- [Explore pricing](/docs/speed-insights/limits-and-pricing)
- [Troubleshooting](/docs/speed-insights/troubleshooting)
