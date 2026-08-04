# DEP-012S Exact Cost Baseline

## Fixture

| Item | Value |
|------|-------|
| Content | 3 cues × "Hello world from test" (21 chars each) |
| Profile | subtitle_en_to_vi_v1 |
| Provider | mock_deterministic |
| Model config | mock_deterministic |

## Pricing

| Item | Value |
|------|-------|
| cost_input_per_million | 1.00 USD |
| cost_output_per_million | 2.00 USD |

## Exact Cost E

| Item | Value |
|------|-------|
| input_units | 63 |
| output_units | 78 |
| input_cost | 0.000063 USD |
| output_cost | 0.000156 USD |
| total_estimated_cost (E) | **0.0002 USD** |
| currency | USD |
| pricing_version | mock_deterministic |
| reservation_estimated_amount | 0.000253 USD |

## Definition

```
E = 0.0002 USD (rounded to 4 decimal places)
Reservation estimate = 0.000253 USD (pre-provider budget check value)
```
