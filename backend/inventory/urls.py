from django.urls import path
from . import views

urlpatterns = [
    path("auth/csrf/", views.csrf_token),
    path("auth/login/", views.sign_in),
    path("auth/logout/", views.sign_out),
    path("auth/me/", views.current_user),
    path("dashboard/", views.dashboard),
    path("calculator/", views.calculator),
    path("products/", views.products),
    path("products/<int:product_id>/", views.product_detail),
    path("categories/", views.categories),
    path("sections/", views.sections),
    path("warehouses/", views.warehouses),
    path("suppliers/", views.suppliers),
    path("customers/", views.customers),
    path("movements/", views.movements),
    path("stock/adjust/", views.stock_adjustment),
    path("stock/transfer/", views.stock_transfer),
    path("sales/", views.sales),
    path("purchases/", views.purchases),
    path("payments/receive/", views.receive_customer_payment),
    path("settings/inventory/", views.inventory_settings),
    path("reports/inventory.csv", views.inventory_csv),
]
