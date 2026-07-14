"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { countryFromText, resolvePricingCountry } = require("../services/pricing/location-resolver");

test("reconnaît Djerba et Sfax comme des villes tunisiennes", () => {
  assert.equal(countryFromText("Je suis à Djerba"), "Tunisie");
  assert.equal(countryFromText("intervention urgente sur Sfax"), "Tunisie");
});

test("le lieu du message est prioritaire sur le GPS et le profil", () => {
  assert.equal(resolvePricingCountry({
    text: "Intervention à Sfax",
    instantLocation: { city: "Alger", lat: 36.75, lng: 3.05 },
    profile: { city: "Casablanca" },
  }), "Tunisie");
});

test("utilise ensuite la localisation instantanée puis le profil", () => {
  assert.equal(resolvePricingCountry({ text: "Ma clim est en panne", instantLocation: { city: "Djerba" }, profile: { city: "Alger" } }), "Tunisie");
  assert.equal(resolvePricingCountry({ text: "Ma clim est en panne", profile: { city: "Alger Centre" } }), "Algérie");
});

test("ignore des coordonnées de secours éloignées au lieu d'inventer un pays", () => {
  assert.equal(resolvePricingCountry({ text:"Ma clim ne refroidit plus", instantLocation:{city:"Position",lat:0,lng:0}, profile:{city:"Tawrit Djerba",address:"Djerba, Tunisie"} }), "Tunisie");
});
