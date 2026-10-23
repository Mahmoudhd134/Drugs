import type {SvgIconComponent} from "@mui/icons-material";
import AccessibilityNewIcon from "@mui/icons-material/AccessibilityNew";
import AirIcon from "@mui/icons-material/Air";
import BackHandIcon from "@mui/icons-material/BackHand";
import BiotechIcon from "@mui/icons-material/Biotech";
import BloodtypeIcon from "@mui/icons-material/Bloodtype";
import CategoryIcon from "@mui/icons-material/Category";
import ChildCareIcon from "@mui/icons-material/ChildCare";
import CoronavirusIcon from "@mui/icons-material/Coronavirus";
import FemaleIcon from "@mui/icons-material/Female";
import HealingIcon from "@mui/icons-material/Healing";
import HearingIcon from "@mui/icons-material/Hearing";
import HubIcon from "@mui/icons-material/Hub";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import MaleIcon from "@mui/icons-material/Male";
import MedicationIcon from "@mui/icons-material/Medication";
import MonitorHeartIcon from "@mui/icons-material/MonitorHeart";
import PsychologyIcon from "@mui/icons-material/Psychology";
import RestaurantIcon from "@mui/icons-material/Restaurant";
import SpaIcon from "@mui/icons-material/Spa";
import VaccinesIcon from "@mui/icons-material/Vaccines";
import VisibilityIcon from "@mui/icons-material/Visibility";
import WaterDropIcon from "@mui/icons-material/WaterDrop";
import WaterIcon from "@mui/icons-material/Water";

/**
 * A pictogram per catalog category (M1.7 review R4), by the ids `load_catalog.py` gives the 23 categories; any other
 * category gets the generic one. Decoration only: the category's name carries the meaning.
 */
const ICONS: Record<number, SvgIconComponent> = {
    1: CoronavirusIcon, // Anti-infectives
    2: MonitorHeartIcon, // Cardiovascular
    3: WaterDropIcon, // Diabetes & Endocrine
    4: RestaurantIcon, // Gastrointestinal & Liver
    5: AirIcon, // Respiratory & Allergy
    6: HealingIcon, // Pain & Inflammation
    7: AccessibilityNewIcon, // Bones & Joints
    8: PsychologyIcon, // Psychiatry
    9: HubIcon, // Neurology
    10: BiotechIcon, // Oncology
    11: BloodtypeIcon, // Blood
    12: WaterIcon, // Kidney & Urology
    13: MaleIcon, // Men's & Sexual Health
    14: FemaleIcon, // Women's Health
    15: BackHandIcon, // Dermatology
    16: SpaIcon, // Skin & Hair Care
    17: VisibilityIcon, // Eye
    18: HearingIcon, // ENT & Mouth
    19: MedicationIcon, // Vitamins & Supplements
    20: ChildCareIcon, // Nutrition & Baby
    21: VaccinesIcon, // Immunology & Vaccines
    22: LocalHospitalIcon, // Anesthesia & Hospital
};

export const categoryIcon = (categoryId: number): SvgIconComponent => ICONS[categoryId] ?? CategoryIcon;
