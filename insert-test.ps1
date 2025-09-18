$headers = @{
  "apikey"        = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2YXFkcWlwYmFvYW1iZHZ4dWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1Mzk2MjQsImV4cCI6MjA3MzExNTYyNH0.e7CPh397hJGkrLH02_Fhd5Isayy_RRGncoQ4Cy8WtdY"
  "Authorization" = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2YXFkcWlwYmFvYW1iZHZ4dWR4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc1Mzk2MjQsImV4cCI6MjA3MzExNTYyNH0.e7CPh397hJGkrLH02_Fhd5Isayy_RRGncoQ4Cy8WtdY"
  "Content-Type"  = "application/json"
  "Prefer"        = "return=representation"
}

$body = @{
  sale_id    = "0f6f82dc-765b-40f4-b7af-31e0ea07a588"
  product_id = "2602b049-f549-41a1-8222-aa87b7a09c7b"
  qty        = 2
} | ConvertTo-Json

$res = Invoke-RestMethod -Uri "https://lvaqdqipbaoambdvxudx.supabase.co/rest/v1/sale_items?select=*" `
  -Method Post -Headers $headers -Body $body

$res | Format-List
