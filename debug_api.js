import { fetchAds } from "./api/helpers/core.js";

async function run() {
    try {
        console.log("Fetching ads...");
        const ads = await fetchAds();
        console.log(`Fetched ${ads.length} ads.`);

        if (ads.length > 0) {
            console.log("Sample Ad (Keys):", Object.keys(ads[0]));
            const withAngles = ads.filter(a => a.f_angles);
            console.log(`Ads with f_angles: ${withAngles.length}`);
            if (withAngles.length > 0) {
                console.log("Sample f_angles:", withAngles[0].f_angles);
            }
        }
    } catch (err) {
        console.error("Error:", err);
    }
}

run();
