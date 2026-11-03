"""Settings for a pipeline run. Change values here or override them from the command line.

Timeline of a run (each period is `horizon` days, counting back from the last date):

    ... training ... | tuning (2) | calibration (4) | test (4) |
                                                               2016-06-19

- tuning:      LightGBM settings are chosen here.
- calibration: supplies the first past errors for prediction ranges and picks the ensemble members.
- test:        the only periods used to report results.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class RetailConfig:
    # Which part of the M5 dataset to use.
    store_id: str = "CA_1"
    n_items: int = 500  # products scored; the machine-learning models train on the whole store
    min_history_days: int = 730  # only products selling for at least two years
    seed: int = 42

    # Forecasting and backtesting.
    horizon: int = 28  # days forecast ahead from each cutoff
    n_windows: int = 4  # test periods used to report results
    calibration_windows: int = 4  # past periods whose errors set the prediction ranges
    tuning_windows: int = 2  # periods before calibration used to choose LightGBM settings
    levels: tuple[int, ...] = (80, 95)  # prediction range levels, in percent
    ensemble_size: int = 3  # number of best models averaged into the ensemble
    event_lead_days: int = 3  # days before an event counted as event days in the accuracy report

    # Inventory recommendation.
    lead_time_days: int = 7  # days between placing an order and receiving it
    service_level: float = 0.95  # target probability of not running out during the lead time

    # Export for the website.
    history_days_exported: int = 182
