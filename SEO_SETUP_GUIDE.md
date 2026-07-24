# Google Search Console Setup Guide

## Quick Links

| Tool | URL |
|------|-----|
| **Google Search Console** | https://search.google.com/search-console |
| **Rich Results Test** | https://search.google.com/test/rich-results |
| **PageSpeed Insights** | https://pagespeed.web.dev/ |
| **Mobile-Friendly Test** | https://search.google.com/test/mobile-friendly |
| **Schema Markup Validator** | https://validator.schema.org/ |

---

## Step 1: Add Property to GSC

1. Go to https://search.google.com/search-console
2. Click **"Add property"**
3. Choose **"Domain"** and enter: `2hands.ai`
4. Click **Continue**

---

## Step 2: Verify Ownership

### Option A: DNS Verification (Recommended)

1. Copy the TXT record provided by Google
2. Go to your domain registrar (where you bought 2hands.ai)
3. Add a DNS TXT record:
   - Type: `TXT`
   - Name/Host: `@` (or leave blank)
   - Value: `google-site-verification=YOUR_CODE_HERE`
4. Wait 5-10 minutes for DNS propagation
5. Click **Verify** in GSC

### Option B: HTML Meta Tag

1. In GSC, select **"HTML tag"** verification method
2. Copy the meta tag (looks like): 
   ```html
   <meta name="google-site-verification" content="YOUR_CODE" />
   ```
3. Open `/apps/web/src/app/layout.tsx`
4. Find the `verification` section and update:
   ```typescript
   verification: {
     google: "YOUR_CODE_HERE",
   },
   ```
5. Deploy to Vercel
6. Click **Verify** in GSC

---

## Step 3: Submit Sitemap

1. In GSC, go to **"Sitemaps"** in the left sidebar
2. Enter: `sitemap.xml`
3. Click **Submit**

Your sitemap URL: `https://2hands.ai/sitemap.xml`

---

## Step 4: Submit to Bing (Optional but Recommended)

| Tool | URL |
|------|-----|
| **Bing Webmaster Tools** | https://www.bing.com/webmasters |

1. Sign in with Microsoft account
2. Add site: `https://2hands.ai`
3. Verify ownership (can import from GSC)
4. Submit sitemap

---

## Step 5: Key GSC Reports to Monitor

### 1. Performance Report
- **URL**: `https://search.google.com/search-console/performance/search-analytics`
- Check: Clicks, impressions, CTR, average position

### 2. Coverage Report
- **URL**: `https://search.google.com/search-console/index/coverage`
- Check: Indexed pages, errors, exclusions

### 3. Core Web Vitals
- **URL**: `https://search.google.com/search-console/core-web-vitals`
- Check: LCP, FID/INP, CLS scores

### 4. Enhancements
- Check: Structured data validity
- Look for: FAQ, HowTo, SoftwareApplication rich results

---

## SEO Health Check Commands

```bash
# Test your sitemap is accessible
curl https://2hands.ai/sitemap.xml

# Test robots.txt
curl https://2hands.ai/robots.txt

# Check structured data
curl https://search.google.com/test/rich-results?url=https://2hands.ai
```

---

## Post-Setup Checklist

- [ ] Property verified in GSC
- [ ] Sitemap submitted
- [ ] robots.txt validated
- [ ] Structured data tested
- [ ] Mobile-friendly test passed
- [ ] Core Web Vitals monitored
- [ ] Bing Webmaster Tools configured

---

## Troubleshooting

### "URL not found" errors
- Wait 24-48 hours after deployment
- Check `/robots.ts` isn't blocking the URL
- Request indexing via GSC URL Inspection tool

### Sitemap errors
- Ensure `sitemap.xml` is accessible at root
- Check no authentication is required
- Validate XML format

### Verification fails
- DNS: Wait longer for propagation (up to 24h)
- HTML tag: Ensure code is in `<head>` section
- Try alternative verification method

---

## Support Resources

- **Google Search Console Help**: https://support.google.com/webmasters
- **Next.js SEO Docs**: https://nextjs.org/docs/app/building-your-application/optimizing/metadata
- **Schema.org**: https://schema.org/docs/schemas.html
