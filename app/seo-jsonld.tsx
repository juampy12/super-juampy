'use client';
import React from 'react';

export default function JsonLd() {
  const data = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Super Juampy",
      "url": "System.Management.Automation.Internal.Host.InternalHost",
      "logo": "System.Management.Automation.Internal.Host.InternalHost/logo.png"
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      "name": "Super Juampy",
      "url": "System.Management.Automation.Internal.Host.InternalHost",
      "potentialAction": {
        "@type": "SearchAction",
        "target": "System.Management.Automation.Internal.Host.InternalHost/search?q={query}",
        "query-input": "required name=query"
      }
    }
  ];
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
