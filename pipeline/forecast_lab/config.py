"""Settings for a pipeline run. Change values here or override them from the command line."""

from dataclasses import dataclass


@dataclass(frozen=True)
class RetailConfig:
    # Which part of the M5 dataset to use.
    store_id: str = "CA_1"
    n_items: int = 500
    min_history_days: int = 730  # only products selling for at least two years
    seed: int = 42

    # Forecasting and backtesting.
    horizon: int = 28  # days forecast ahead from each cutoff
    n_windows: int = 4  # past 28-day periods used to score the models
    calibration_windows: int = 2  # earlier periods whose errors set the prediction intervals
    levels: tuple[int, ...] = (80, 95)  # prediction interval levels, in percent

    # Inventory recommendation.
    lead_time_days: int = 7  # days between placing an order and receiving it
    service_level: float = 0.95  # target probability of not running out during the lead time

    # Export for the website.
    history_days_exported: int = 182
